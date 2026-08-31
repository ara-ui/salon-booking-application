const { Appointment, Service, Staff, User, Payment } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { getCashfree } = require('../utils/cashfreeClient');
const { maybeGenerateInvoice } = require('../utils/invoiceService');

// Creates a Cashfree Sandbox order for an unpaid appointment and a matching
// 'pending' Payment row. Returns the paymentSessionId the frontend needs to
// open the embedded Cashfree checkout modal (see public/js/customer.js).
async function createCashfreeOrder(req, res) {
  const { appointmentId } = req.body;
  if (!appointmentId) throw new AppError(400, 'appointmentId is required');

  const appointment = await Appointment.findByPk(appointmentId, { include: [Service] });
  if (!appointment) throw new AppError(404, 'Appointment not found');
  if (appointment.customerId !== req.user.id) throw new AppError(403, 'Not your appointment');
  if (appointment.paymentStatus === 'paid') throw new AppError(400, 'This appointment is already paid');

  const customer = await User.findByPk(req.user.id);

  // Uses the SALON's actual service price — never a hardcoded amount.
  const payment = await Payment.create({
    appointmentId: appointment.id,
    amount: appointment.Service.price,
    status: 'pending',
  });

  const cashfreeOrderId = `SALON_ORDER_${appointment.id}_${Date.now()}`;

  const cashfree = getCashfree();
  const response = await cashfree.PGCreateOrder({
    order_id: cashfreeOrderId,
    order_amount: Number(appointment.Service.price),
    // Cashfree Sandbox reliably supports INR regardless of how the app
    // displays prices elsewhere (this project's UI uses $ formatting via
    // fmtMoney) — the order_currency here is just what's sent to Cashfree,
    // it doesn't change what's shown anywhere in the app.
    order_currency: 'INR',
    customer_details: {
      customer_id: String(customer.id),
      customer_email: customer.email,
      // Cashfree Sandbox requires a phone number on every order; fall back
      // to a placeholder if the customer never set one on their profile.
      // A production deployment should require a real phone at signup/checkout.
      customer_phone: customer.phone || '9999999999',
      customer_name: customer.name,
    },
  });

  payment.providerOrderId = response.data.order_id;
  await payment.save();

  res.json({
    orderId: response.data.order_id,
    paymentSessionId: response.data.payment_session_id,
    paymentId: payment.id,
  });
}

// Called by the frontend after the Cashfree checkout modal resolves. Does
// NOT trust that callback by itself — independently re-verifies the result
// with Cashfree's server-side PGOrderFetchPayments before marking anything
// paid. This replaces the old Stripe webhook as the trust boundary.
async function verifyCashfreePayment(req, res) {
  const { orderId } = req.body;
  if (!orderId) throw new AppError(400, 'orderId is required');

  const payment = await Payment.findOne({ where: { providerOrderId: orderId } });
  if (!payment) throw new AppError(404, 'No payment found for this order');
  if (payment.appointmentId == null) throw new AppError(404, 'Payment is not linked to an appointment');

  // Ownership check — a customer can only verify their own payment.
  const appointment = await Appointment.findByPk(payment.appointmentId);
  if (!appointment || appointment.customerId !== req.user.id) {
    throw new AppError(403, 'Not your payment');
  }

  if (payment.status === 'succeeded') {
    // Already verified previously (e.g. a duplicate frontend call) — return
    // the current state rather than re-verifying or erroring.
    return res.json({ status: 'succeeded', appointmentPaymentStatus: appointment.paymentStatus });
  }

  const cashfree = getCashfree();
  const result = await cashfree.PGOrderFetchPayments(orderId);
  const payments = result.data || [];
  const successfulPayment = payments.find((p) => p.payment_status === 'SUCCESS');

  if (!successfulPayment) {
    payment.status = 'failed';
    await payment.save();
    throw new AppError(400, 'Payment could not be verified as successful');
  }

  payment.status = 'succeeded';
  payment.providerPaymentId = successfulPayment.cf_payment_id;
  await payment.save();

  appointment.paymentStatus = 'paid';
  await appointment.save();

  // Only actually generates an invoice if the appointment is ALSO already
  // 'completed' — otherwise it's generated later, when updateAppointmentStatus
  // marks it completed. See utils/invoiceService.js. Behavior unchanged from
  // the Stripe implementation.
  await maybeGenerateInvoice(appointment.id);

  res.json({ status: 'succeeded', appointmentPaymentStatus: 'paid' });
}

// Customer's own payment history — ownership enforced via the where clause,
// not just a frontend filter.
async function getMyPayments(req, res) {
  const payments = await Payment.findAll({
    include: [{
      model: Appointment,
      where: { customerId: req.user.id },
      include: [Service],
      required: true,
    }],
    order: [['createdAt', 'DESC']],
  });
  res.json(payments);
}

// Admin: every payment in the system, with enough joined detail to show
// customer/service/appointment context without extra round-trips.
async function getAllPayments(req, res) {
  const payments = await Payment.findAll({
    include: [{
      model: Appointment,
      include: [
        Service,
        { model: User, as: 'customer', attributes: ['id', 'name', 'email'] },
      ],
      required: true,
    }],
    order: [['createdAt', 'DESC']],
  });
  res.json(payments);
}

module.exports = { createCashfreeOrder, verifyCashfreePayment, getMyPayments, getAllPayments };

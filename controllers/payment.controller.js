const { Appointment, Service, Staff, User, Payment } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { getCashfree } = require('../utils/cashfreeClient');
const { maybeGenerateInvoice } = require('../utils/invoiceService');

async function createCashfreeOrder(req, res) {
  const { appointmentId } = req.body;

  if (!appointmentId) {
    throw new AppError(400, 'appointmentId is required');
  }

  const appointment = await Appointment.findByPk(appointmentId, {
    include: [Service],
  });

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  if (appointment.customerId !== req.user.id) {
    throw new AppError(403, 'Not your appointment');
  }

  if (appointment.paymentStatus === 'paid') {
    throw new AppError(400, 'This appointment is already paid');
  }

  const cashfree = getCashfree();

  const existingPendingPayment = await Payment.findOne({
    where: {
      appointmentId: appointment.id,
      status: 'pending',
    },
    order: [['createdAt', 'DESC']],
  });

  if (existingPendingPayment) {
    if (!existingPendingPayment.providerOrderId) {
      existingPendingPayment.status = 'failed';
      await existingPendingPayment.save();
    } else {
      try {
        const existingOrderResult = await cashfree.PGFetchOrder(
          existingPendingPayment.providerOrderId
        );
        const existingOrder = existingOrderResult.data;

        if (existingOrder.order_status === 'EXPIRED') {
          existingPendingPayment.status = 'failed';
          await existingPendingPayment.save();
        } else {
          // The old Cashfree order is still usable — resume it instead of
          // blocking the customer for up to 15 minutes until it expires.
          // Cashfree's payment_session_id remains valid for the order's
          // whole lifetime, so it's safe to hand back and reopen the modal.
          return res.json({
            orderId: existingOrder.order_id,
            paymentSessionId: existingOrder.payment_session_id,
            paymentId: existingPendingPayment.id,
          });
        }
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }
        console.error('Failed to check existing Cashfree payment order:', err);
        throw new AppError(
          503,
          'Unable to check the existing payment attempt. Please try again shortly.'
        );
      }
    }
  }

  const customer = await User.findByPk(req.user.id);

  if (!customer) {
    throw new AppError(404, 'Customer not found');
  }

  const payment = await Payment.create({
    appointmentId: appointment.id,
    amount: appointment.Service.price,
    status: 'pending',
  });

  const cashfreeOrderId = `SALON_ORDER_${appointment.id}_${Date.now()}`;
  const expiryTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  try {
    const response = await cashfree.PGCreateOrder({
      order_id: cashfreeOrderId,
      order_amount: Number(appointment.Service.price),
      order_currency: 'INR',
      order_expiry_time: expiryTime,
      customer_details: {
        customer_id: String(customer.id),
        customer_email: customer.email,
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
  } catch (err) {
    payment.status = 'failed';
    await payment.save();
    throw err;
  }
}


async function verifyCashfreePayment(req, res) {
  const { orderId } = req.body;

  if (!orderId) {
    throw new AppError(400, 'orderId is required');
  }

  const payment = await Payment.findOne({
    where: {
      providerOrderId: orderId,
    },
  });

  if (!payment) {
    throw new AppError(404, 'No payment found for this order');
  }

  if (payment.appointmentId == null) {
    throw new AppError(
      404,
      'Payment is not linked to an appointment'
    );
  }

  const appointment = await Appointment.findByPk(
    payment.appointmentId
  );

  if (!appointment || appointment.customerId !== req.user.id) {
    throw new AppError(403, 'Not your payment');
  }

  if (payment.status === 'succeeded') {
    await maybeGenerateInvoice(appointment.id);

    return res.json({
      status: 'succeeded',
      appointmentPaymentStatus: appointment.paymentStatus,
    });
  }

  const cashfree = getCashfree();
  const orderResult = await cashfree.PGFetchOrder(orderId);
  const order = orderResult.data;

 
  if (order.order_status === 'EXPIRED') {
    payment.status = 'failed';
    await payment.save();

    throw new AppError(
      400,
      'Payment session has expired. Please try again.'
    );
  }

  const result = await cashfree.PGOrderFetchPayments(orderId);
  const payments = result.data || [];

  const successfulPayment = payments.find(
    (p) => p.payment_status === 'SUCCESS'
  );

    if (!successfulPayment) {
    throw new AppError(
      400,
      'Payment has not been completed successfully yet.'
    );
  }

  payment.status = 'succeeded';
  payment.providerPaymentId = successfulPayment.cf_payment_id;
  await payment.save();

  appointment.paymentStatus = 'paid';
  await appointment.save();

  await maybeGenerateInvoice(appointment.id);

  res.json({
    status: 'succeeded',
    appointmentPaymentStatus: 'paid',
  });
}


async function getMyPayments(req, res) {
  const payments = await Payment.findAll({
    where: {
      status: 'succeeded',
    },

    include: [{
      model: Appointment,
      where: {
        customerId: req.user.id,
      },
      include: [Service],
      required: true,
    }],

    order: [['createdAt', 'DESC']],
  });

  res.json(payments);
}


async function getAllPayments(req, res) {
  const payments = await Payment.findAll({
    include: [{
      model: Appointment,
      include: [
        Service,
        {
          model: User,
          as: 'customer',
          attributes: ['id', 'name', 'email'],
        },
      ],
      required: true,
    }],

    order: [['createdAt', 'DESC']],
  });

  res.json(payments);
}


module.exports = {
  createCashfreeOrder,
  verifyCashfreePayment,
  getMyPayments,
  getAllPayments,
};
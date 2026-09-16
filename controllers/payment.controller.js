const { Appointment, Service, User, Payment } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { getCashfree } = require('../utils/cashfreeClient');
const { maybeGenerateInvoice } = require('../utils/invoiceService');

async function getSuccessfulPayment(appointmentId) {
  return Payment.findOne({
    where: {
      appointmentId,
      status: 'succeeded',
    },
    order: [['createdAt', 'DESC']],
  });
}

async function reconcileAppointmentPaymentStatus(appointment) {
  const successfulPayment = await getSuccessfulPayment(appointment.id);
  const expectedStatus = successfulPayment ? 'paid' : 'unpaid';

  if (appointment.paymentStatus !== expectedStatus) {
    appointment.paymentStatus = expectedStatus;
    await appointment.save();
  }

  return successfulPayment;
}

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

  if (appointment.status !== 'completed') {
    throw new AppError(
      400,
      'Payment is available only after the staff completion step'
    );
  }

  // Payment is determined from the server-side ledger, never from a stale
  // Appointment.paymentStatus value.
  const successfulPayment = await reconcileAppointmentPaymentStatus(appointment);

  if (successfulPayment) {
    await maybeGenerateInvoice(appointment.id);
    throw new AppError(400, 'This appointment is already paid');
  }

  const cashfree = getCashfree();

  // Reuse an existing pending order only after Cashfree confirms it is still
  // ACTIVE. Stale provider orders must never be sent back to the browser.
  const existingPendingPayment = await Payment.findOne({
    where: {
      appointmentId: appointment.id,
      status: 'pending',
    },
    order: [['createdAt', 'DESC']],
  });

  if (existingPendingPayment?.providerOrderId) {
    try {
      const existingOrderResult = await cashfree.PGFetchOrder(
        existingPendingPayment.providerOrderId
      );
      const existingOrder = existingOrderResult.data || {};
      const orderStatus = String(
        existingOrder.order_status || ''
      ).toUpperCase();

      if (orderStatus === 'PAID') {
        const paymentResult = await cashfree.PGOrderFetchPayments(
          existingPendingPayment.providerOrderId
        );

        const successfulProviderPayment = (paymentResult.data || []).find(
          (item) => item.payment_status === 'SUCCESS'
        );

        if (successfulProviderPayment) {
          existingPendingPayment.status = 'succeeded';
          existingPendingPayment.providerPaymentId =
            successfulProviderPayment.cf_payment_id;
          await existingPendingPayment.save();

          appointment.paymentStatus = 'paid';
          await appointment.save();
          await maybeGenerateInvoice(appointment.id);

          throw new AppError(400, 'This appointment is already paid');
        }
      }

      if (
        orderStatus === 'ACTIVE' &&
        existingOrder.payment_session_id
      ) {
        return res.json({
          orderId: existingOrder.order_id,
          paymentSessionId: existingOrder.payment_session_id,
          paymentId: existingPendingPayment.id,
        });
      }

      existingPendingPayment.status = 'failed';
      await existingPendingPayment.save();
    } catch (err) {
      if (err instanceof AppError) throw err;

      const status = Number(err?.response?.status || err?.status || 0);

      if (status === 404) {
        existingPendingPayment.status = 'failed';
        await existingPendingPayment.save();
      } else {
        console.error(
          'Failed to check existing Cashfree payment order:',
          err
        );
        throw new AppError(
          503,
          'Unable to check the existing payment attempt. Please try again shortly.'
        );
      }
    }
  } else if (existingPendingPayment) {
    existingPendingPayment.status = 'failed';
    await existingPendingPayment.save();
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
  const expiryTime = new Date(
    Date.now() + 30 * 60 * 1000
  ).toISOString();

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

    const createdOrder = response.data || {};

    if (
      !createdOrder.order_id ||
      !createdOrder.payment_session_id
    ) {
      payment.status = 'failed';
      await payment.save();

      throw new AppError(
        502,
        'Cashfree did not return a valid payment session. Please try again.'
      );
    }

    payment.providerOrderId = createdOrder.order_id;
    await payment.save();

    return res.json({
      orderId: createdOrder.order_id,
      paymentSessionId: createdOrder.payment_session_id,
      paymentId: payment.id,
    });
  } catch (err) {
    if (payment.status !== 'failed') {
      payment.status = 'failed';
      await payment.save();
    }
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

  const appointment = await Appointment.findByPk(
    payment.appointmentId
  );

  if (!appointment || appointment.customerId !== req.user.id) {
    throw new AppError(403, 'Not your payment');
  }

  if (appointment.status !== 'completed') {
    throw new AppError(
      400,
      'Payment is available only after the staff completion step'
    );
  }

  if (payment.status === 'succeeded') {
    appointment.paymentStatus = 'paid';
    await appointment.save();
    await maybeGenerateInvoice(appointment.id);

    return res.json({
      status: 'succeeded',
      appointmentPaymentStatus: 'paid',
    });
  }

  const cashfree = getCashfree();

  const orderResult = await cashfree.PGFetchOrder(orderId);
  const order = orderResult.data || {};

  if (
    Number(order.order_amount) !== Number(payment.amount)
  ) {
    throw new AppError(
      400,
      'Payment amount could not be verified. Please contact the salon.'
    );
  }

  if (String(order.order_status || '').toUpperCase() === 'EXPIRED') {
    payment.status = 'failed';
    await payment.save();

    throw new AppError(
      400,
      'Payment session has expired. Please try again.'
    );
  }

  const result = await cashfree.PGOrderFetchPayments(orderId);
  const successfulPayment = (result.data || []).find(
    (item) => item.payment_status === 'SUCCESS'
  );

  if (!successfulPayment) {
    throw new AppError(
      400,
      'Payment has not been completed successfully yet.'
    );
  }

  payment.status = 'succeeded';
  payment.providerPaymentId =
    successfulPayment.cf_payment_id;
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

const { Appointment, Service, User, Payment } = require('../models');

const { AppError } = require('../middleware/error.middleware');

const { getCashfree } = require('../utils/cashfreeClient');

const { maybeGenerateInvoice } = require('../utils/invoiceService');

const {
  settleSuccessfulPayment,
} = require('../services/paymentSettlement.service');


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


/* =========================================================
   CREATE CASHFREE ORDER
   ========================================================= */

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

  /*
   * Payment is allowed only after the staff completion step.
   */
  if (appointment.status !== 'completed') {
    throw new AppError(
      400,
      'Payment is available only after the staff completion step'
    );
  }

  /*
   * Reconcile the appointment payment status from the actual
   * successful Payment record.
   *
   * Completion code verification must NEVER make an appointment
   * paid. Only a successful Payment record can do that.
   */
  const successfulPayment =
    await reconcileAppointmentPaymentStatus(appointment);

  if (successfulPayment) {
    await maybeGenerateInvoice(appointment.id);

    throw new AppError(
      400,
      'This appointment is already paid'
    );
  }

  const cashfree = getCashfree();

  /*
   * Reuse an existing pending Cashfree order only when the
   * provider confirms that the order is still ACTIVE.
   */
  const existingPendingPayment = await Payment.findOne({
    where: {
      appointmentId: appointment.id,
      status: 'pending',
    },
    order: [['createdAt', 'DESC']],
  });

  if (existingPendingPayment?.providerOrderId) {
    try {
      const existingOrderResult =
        await cashfree.PGFetchOrder(
          existingPendingPayment.providerOrderId
        );

      const existingOrder =
        existingOrderResult.data || {};

      const orderStatus = String(
        existingOrder.order_status || ''
      ).toUpperCase();

      /*
       * Cashfree says the order is already paid.
       * Reconcile it into our local payment ledger.
       */
      if (orderStatus === 'PAID') {
        const paymentResult =
          await cashfree.PGOrderFetchPayments(
            existingPendingPayment.providerOrderId
          );

        const successfulProviderPayment =
          (paymentResult.data || []).find(
            (item) =>
              String(item.payment_status || '').toUpperCase() ===
              'SUCCESS'
          );

        if (successfulProviderPayment) {
          await settleSuccessfulPayment(
            existingPendingPayment,
            successfulProviderPayment.cf_payment_id
          );

          throw new AppError(
            400,
            'This appointment is already paid'
          );
        }
      }

      /*
       * Only reuse an ACTIVE order that has a valid
       * payment session.
       */
      if (
        orderStatus === 'ACTIVE' &&
        existingOrder.payment_session_id
      ) {
        return res.json({
          orderId: existingOrder.order_id,
          paymentSessionId:
            existingOrder.payment_session_id,
          paymentId: existingPendingPayment.id,
        });
      }

      /*
       * Existing order is no longer usable.
       */
      existingPendingPayment.status = 'failed';
      await existingPendingPayment.save();

    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }

      const status = Number(
        err?.response?.status ||
        err?.status ||
        0
      );

      /*
       * Cashfree no longer knows this order.
       * Mark the local attempt failed and create a new order.
       */
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
    /*
     * A local pending payment without a Cashfree order
     * cannot be reused.
     */
    existingPendingPayment.status = 'failed';
    await existingPendingPayment.save();
  }


  /* =========================================================
     CUSTOMER
     ========================================================= */

  const customer = await User.findByPk(req.user.id);

  if (!customer) {
    throw new AppError(404, 'Customer not found');
  }


  /* =========================================================
     LOCAL PAYMENT RECORD
     ========================================================= */

  const payment = await Payment.create({
    appointmentId: appointment.id,
    amount: appointment.Service.price,
    status: 'pending',
  });


  /* =========================================================
     CASHFREE ORDER
     ========================================================= */

  const cashfreeOrderId =
    `SALON_ORDER_${appointment.id}_${Date.now()}`;

  const expiryTime = new Date(
    Date.now() + 30 * 60 * 1000
  ).toISOString();


  /*
   * Cashfree webhook URL and return URL.
   *
   * In your Salon .env:
   *
   * APP_URL=https://YOUR-SALON-NGROK-URL
   *
   * OR:
   *
   * CLIENT_URL=http://localhost:3001
   */
  const appUrl = (
    process.env.APP_URL ||
    process.env.CLIENT_URL ||
    'http://localhost:3001'
  ).replace(/\/$/, '');

  const webhookUrl =
    `${appUrl}/purchase/webhook/cashfree`;

  const returnUrl =
    `${appUrl}/html/customer.html`;


  try {
    const response = await cashfree.PGCreateOrder({
      order_id: cashfreeOrderId,

      order_amount:
        Number(appointment.Service.price),

      order_currency: 'INR',

      order_expiry_time: expiryTime,

      customer_details: {
        customer_id: String(customer.id),

        customer_email: customer.email,

        customer_phone:
          customer.phone || '9999999999',

        customer_name: customer.name,
      },

      /*
       * Cashfree sends payment notifications to this
       * webhook endpoint.
       */
      order_meta: {
        notify_url: webhookUrl,
        return_url: returnUrl,
      },
    });


    const createdOrder =
      response.data || {};


    /*
     * Cashfree must return both values needed by
     * the browser checkout.
     */
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


    payment.providerOrderId =
      createdOrder.order_id;

    await payment.save();


    return res.json({
      orderId: createdOrder.order_id,

      paymentSessionId:
        createdOrder.payment_session_id,

      paymentId: payment.id,
    });

  } catch (err) {
    /*
     * Never leave a local payment stuck in pending when
     * Cashfree order creation itself failed.
     */
    if (payment.status !== 'failed') {
      payment.status = 'failed';
      await payment.save();
    }

    throw err;
  }
}


/* =========================================================
   VERIFY CASHFREE PAYMENT
   ========================================================= */

async function verifyCashfreePayment(req, res) {
  const { orderId } = req.body;

  if (!orderId) {
    throw new AppError(400, 'orderId is required');
  }


  /*
   * Find our local payment using the Cashfree order ID.
   */
  const payment = await Payment.findOne({
    where: {
      providerOrderId: orderId,
    },
  });

  if (!payment) {
    throw new AppError(
      404,
      'No payment found for this order'
    );
  }


  /*
   * Make sure the payment belongs to the logged-in customer.
   */
  const appointment = await Appointment.findByPk(
    payment.appointmentId
  );

  if (
    !appointment ||
    appointment.customerId !== req.user.id
  ) {
    throw new AppError(403, 'Not your payment');
  }


  /*
   * Payment remains locked until staff completes the
   * appointment.
   */
  if (appointment.status !== 'completed') {
    throw new AppError(
      400,
      'Payment is available only after the staff completion step'
    );
  }


  /*
   * If our database already knows that this payment succeeded,
   * simply reconcile the appointment and invoice.
   */
  if (payment.status === 'succeeded') {
    await settleSuccessfulPayment(
      payment,
      payment.providerPaymentId
    );

    return res.json({
      status: 'succeeded',
      appointmentPaymentStatus: 'paid',
    });
  }


  const cashfree = getCashfree();


  /* =========================================================
     FETCH CASHFREE ORDER
     ========================================================= */

  const orderResult =
    await cashfree.PGFetchOrder(orderId);

  const order =
    orderResult.data || {};


  /*
   * Never trust the browser for the payment amount.
   * Compare Cashfree's order amount with our local amount.
   */
  if (
    Number(order.order_amount) !==
    Number(payment.amount)
  ) {
    throw new AppError(
      400,
      'Payment amount could not be verified. Please contact the salon.'
    );
  }


  const orderStatus = String(
    order.order_status || ''
  ).toUpperCase();


  /*
   * Expired Cashfree orders cannot become successful.
   */
  if (orderStatus === 'EXPIRED') {
    payment.status = 'failed';
    await payment.save();

    throw new AppError(
      400,
      'Payment session has expired. Please try again.'
    );
  }


  /* =========================================================
     FETCH CASHFREE PAYMENT ATTEMPTS
     ========================================================= */

  const result =
    await cashfree.PGOrderFetchPayments(orderId);


  const successfulPayment =
    (result.data || []).find(
      (item) =>
        String(item.payment_status || '').toUpperCase() ===
        'SUCCESS'
    );


  /*
   * Cashfree may still be processing the payment immediately
   * after checkout.
   *
   * Return 202 instead of treating it as a failed payment.
   * customer.js will retry verification.
   */
  if (!successfulPayment) {
    return res.status(202).json({
      status: 'pending',

      appointmentPaymentStatus:
        appointment.paymentStatus || 'unpaid',
    });
  }


  /* =========================================================
     SUCCESSFUL PAYMENT
     ========================================================= */

  await settleSuccessfulPayment(
    payment,
    successfulPayment.cf_payment_id
  );


  return res.json({
    status: 'succeeded',
    appointmentPaymentStatus: 'paid',
  });
}


/* =========================================================
   CUSTOMER PAYMENT HISTORY
   ========================================================= */

async function getMyPayments(req, res) {
  const payments = await Payment.findAll({
    where: {
      status: 'succeeded',
    },

    include: [
      {
        model: Appointment,

        where: {
          customerId: req.user.id,
        },

        include: [Service],

        required: true,
      },
    ],

    order: [['createdAt', 'DESC']],
  });

  res.json(payments);
}


/* =========================================================
   ADMIN PAYMENT HISTORY
   ========================================================= */

async function getAllPayments(req, res) {
  const payments = await Payment.findAll({
    include: [
      {
        model: Appointment,

        include: [
          Service,

          {
            model: User,

            as: 'customer',

            attributes: [
              'id',
              'name',
              'email',
            ],
          },
        ],

        required: true,
      },
    ],

    order: [['createdAt', 'DESC']],
  });

  res.json(payments);
}


/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  createCashfreeOrder,
  verifyCashfreePayment,
  getMyPayments,
  getAllPayments,
};
const crypto = require('crypto');
const { Payment } = require('../models');
const { settleSuccessfulPayment } = require('../services/paymentSettlement.service');

const WEBHOOK_TIMESTAMP_TOLERANCE_MS =
  Number(process.env.CASHFREE_WEBHOOK_TOLERANCE_MS || 5 * 60 * 1000);

function getRawBody(req) {
  if (!Buffer.isBuffer(req.body)) return null;
  return req.body.toString('utf8');
}

function verifyCashfreeSignature(req, rawBody) {
  const signature = req.get('x-webhook-signature');
  const timestamp = req.get('x-webhook-timestamp');
  const secret = process.env.CASHFREE_SECRET_KEY;

  if (!signature || !timestamp || !secret || !rawBody) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;

  if (Math.abs(Date.now() - timestampNumber) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('base64');

  const receivedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function getPaymentWebhookData(payload) {
  return {
    type: String(payload?.type || '').toUpperCase(),
    orderId: payload?.data?.order?.order_id || null,
    orderAmount: payload?.data?.order?.order_amount,
    paymentId: payload?.data?.payment?.cf_payment_id || null,
    paymentStatus: String(
      payload?.data?.payment?.payment_status || ''
    ).toUpperCase(),
    paymentAmount: payload?.data?.payment?.payment_amount,
  };
}

async function handleCashfreeWebhook(req, res) {
  const rawBody = getRawBody(req);

  if (!verifyCashfreeSignature(req, rawBody)) {
    console.warn('Rejected Cashfree webhook: invalid signature or timestamp');
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: 'Invalid webhook payload' });
  }

  const event = getPaymentWebhookData(payload);

  // Cashfree can send several payment lifecycle events. We acknowledge
  // unrelated valid events without changing our payment ledger.
  if (!event.orderId) {
    return res.status(200).json({ received: true });
  }

  const payment = await Payment.findOne({
    where: { providerOrderId: event.orderId },
  });

  // A valid webhook for an order that is no longer in our local ledger is
  // acknowledged so Cashfree does not keep retrying an event we cannot map.
  if (!payment) {
    console.warn(`Cashfree webhook received for unknown order: ${event.orderId}`);
    return res.status(200).json({ received: true });
  }

  if (event.type === 'PAYMENT_SUCCESS_WEBHOOK' && event.paymentStatus === 'SUCCESS') {
    if (
      event.orderAmount != null &&
      Number(event.orderAmount) !== Number(payment.amount)
    ) {
      return res.status(400).json({ message: 'Webhook order amount mismatch' });
    }

    if (
      event.paymentAmount != null &&
      Number(event.paymentAmount) !== Number(payment.amount)
    ) {
      return res.status(400).json({ message: 'Webhook payment amount mismatch' });
    }

    const result = await settleSuccessfulPayment(payment, event.paymentId);

    if (!result.settled) {
      // Keep the payment pending until the appointment satisfies the server-side
      // completion gate. Cashfree can retry the webhook later.
      return res.status(409).json({
        message: 'Appointment is not completed yet',
      });
    }

    return res.status(200).json({ received: true, status: 'succeeded' });
  }

  if (
    event.type === 'PAYMENT_FAILED_WEBHOOK' ||
    event.type === 'PAYMENT_USER_DROPPED_WEBHOOK'
  ) {
    // Never downgrade a payment that was already settled successfully.
    if (payment.status !== 'succeeded') {
      payment.status = 'failed';
      await payment.save();
    }
  }

  return res.status(200).json({ received: true });
}

module.exports = { handleCashfreeWebhook };

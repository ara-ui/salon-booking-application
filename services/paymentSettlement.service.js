const { Appointment, Payment } = require('../models');
const { maybeGenerateInvoice } = require('../utils/invoiceService');

/**
 * Marks a payment as successful and reconciles the appointment.
 *
 * This is intentionally shared by browser verification and the Cashfree
 * webhook so there is one server-side settlement path.
 */
async function settleSuccessfulPayment(payment, providerPaymentId) {
  if (!payment) return null;

  const appointment = await Appointment.findByPk(payment.appointmentId);

  if (!appointment) {
    throw new Error(`Appointment ${payment.appointmentId} not found for payment ${payment.id}`);
  }

  // Never allow a payment to bypass the service-completion gate.
  if (appointment.status !== 'completed') {
    return {
      settled: false,
      reason: 'appointment_not_completed',
      appointment,
      payment,
    };
  }

  // Idempotent: duplicate browser verification or duplicate webhook delivery
  // must not create another payment or invoice.
  if (payment.status !== 'succeeded') {
    payment.status = 'succeeded';
    if (providerPaymentId) {
      payment.providerPaymentId = String(providerPaymentId);
    }
    await payment.save();
  } else if (providerPaymentId && !payment.providerPaymentId) {
    payment.providerPaymentId = String(providerPaymentId);
    await payment.save();
  }

  if (appointment.paymentStatus !== 'paid') {
    appointment.paymentStatus = 'paid';
    await appointment.save();
  }

  await maybeGenerateInvoice(appointment.id);

  return {
    settled: true,
    appointment,
    payment,
  };
}

module.exports = { settleSuccessfulPayment };

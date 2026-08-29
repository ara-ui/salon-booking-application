const { Appointment, Service, Staff, User, Payment, Invoice } = require('../models');
const { generateInvoicePdf } = require('./invoicePdf');

/**
 * Generates the PDF invoice + Invoice DB row for an appointment, but only
 * once BOTH conditions are true: the appointment is 'completed' AND its
 * paymentStatus is 'paid'. Matches the assignment's "invoice generation for
 * completed appointments" requirement while still needing a successful
 * payment to know the amount actually charged.
 *
 * Safe to call from multiple trigger points (the Stripe webhook, and
 * marking an appointment completed) — it no-ops if the conditions aren't
 * met yet, and no-ops again if an invoice already exists, so calling it
 * twice (e.g. paid AFTER being marked completed) never creates duplicates.
 */
async function maybeGenerateInvoice(appointmentId) {
  const appointment = await Appointment.findByPk(appointmentId, {
    include: [Service, { model: Staff, include: [User] }, { model: User, as: 'customer' }],
  });
  if (!appointment) return null;
  if (appointment.status !== 'completed' || appointment.paymentStatus !== 'paid') return null;

  const existing = await Invoice.findOne({ where: { appointmentId } });
  if (existing) return existing;

  const payment = await Payment.findOne({
    where: { appointmentId, status: 'succeeded' },
    order: [['createdAt', 'DESC']],
  });
  if (!payment) return null; // shouldn't happen if paymentStatus is 'paid', but guard anyway

  await generateInvoicePdf({
    appointmentId: appointment.id,
    customerName: appointment.customer.name,
    serviceName: appointment.Service.name,
    staffName: appointment.Staff.User.name,
    date: appointment.date,
    startTime: appointment.startTime,
    amount: payment.amount,
  });

  return Invoice.create({
    appointmentId: appointment.id,
    paymentId: payment.id,
    amount: payment.amount,
    pdfUrl: `/api/appointments/${appointment.id}/invoice`, // gated download endpoint, not a raw file path
  });
}

module.exports = { maybeGenerateInvoice };

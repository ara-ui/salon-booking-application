const { Appointment, Service, Staff, User, Payment, Invoice } = require('../models');
const { generateInvoicePdf } = require('./invoicePdf');

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

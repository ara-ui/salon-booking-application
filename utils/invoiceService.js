const fs = require('fs');
const path = require('path');

const {
  Appointment,
  Service,
  Staff,
  User,
  Payment,
  Invoice,
} = require('../models');

const {
  generateInvoicePdf,
  INVOICE_DIR,
} = require('./invoicePdf');

async function maybeGenerateInvoice(appointmentId) {
  const appointment = await Appointment.findByPk(appointmentId, {
    include: [
      Service,
      {
        model: Staff,
        include: [User],
      },
      {
        model: User,
        as: 'customer',
      },
    ],
  });

  if (!appointment) return null;

  // Invoice can only be generated after successful payment.
  if (appointment.paymentStatus !== 'paid') {
    return null;
  }

  const payment = await Payment.findOne({
    where: {
      appointmentId,
      status: 'succeeded',
    },
    order: [['createdAt', 'DESC']],
  });

  if (!payment) return null;

  const filePath = path.join(
    INVOICE_DIR,
    `invoice-appointment-${appointment.id}.pdf`
  );

  const existing = await Invoice.findOne({
    where: { appointmentId },
  });

  // If invoice record exists and PDF exists, everything is fine.
  if (existing && fs.existsSync(filePath)) {
    return existing;
  }

  // Generate/re-generate the PDF.
  await generateInvoicePdf({
    appointmentId: appointment.id,
    customerName: appointment.customer.name,
    serviceName: appointment.Service.name,
    staffName: appointment.Staff.User.name,
    date: appointment.date,
    startTime: appointment.startTime,
    amount: payment.amount,
  });

  // If the invoice record already exists, don't create a duplicate.
  if (existing) {
    existing.paymentId = payment.id;
    existing.amount = payment.amount;
    existing.pdfUrl = `/api/appointments/${appointment.id}/invoice`;

    await existing.save();

    return existing;
  }

  // Otherwise create the invoice record.
  //
  // Browser verification and the Cashfree webhook can settle the same payment
  // at the same moment, so both may reach this point. Invoice.appointmentId is
  // unique: the loser of that race must reuse the winner's invoice instead of
  // failing with a unique-constraint error.
  try {
    return await Invoice.create({
      appointmentId: appointment.id,
      paymentId: payment.id,
      amount: payment.amount,
      pdfUrl: `/api/appointments/${appointment.id}/invoice`,
    });
  } catch (err) {
    if (err?.name !== 'SequelizeUniqueConstraintError') throw err;

    const created = await Invoice.findOne({
      where: { appointmentId },
    });

    if (created) return created;

    throw err;
  }
}

module.exports = { maybeGenerateInvoice };
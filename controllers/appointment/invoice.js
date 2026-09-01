const fs = require('fs');
const path = require('path');

const {
  Appointment,
  Invoice,
} = require('../../models');

const { AppError } = require('../../middleware/error.middleware');
const { INVOICE_DIR } = require('../../utils/invoicePdf');


async function downloadInvoice(req, res) {
  const appointment = await Appointment.findByPk(
    req.params.id
  );

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  const allowed =
    (req.user.role === 'customer' &&
      appointment.customerId === req.user.id) ||
    req.user.role === 'admin';

  if (!allowed) {
    throw new AppError(
      403,
      'You do not have permission to view this invoice'
    );
  }

  const invoice = await Invoice.findOne({
    where: {
      appointmentId: appointment.id,
    },
  });

  if (!invoice) {
    throw new AppError(
      404,
      'No invoice has been generated for this appointment yet'
    );
  }

  const filePath = path.join(
    INVOICE_DIR,
    `invoice-appointment-${appointment.id}.pdf`
  );

  if (!fs.existsSync(filePath)) {
    throw new AppError(
      404,
      'Invoice file not found on disk'
    );
  }

  res.download(
    filePath,
    `invoice-${appointment.id}.pdf`
  );
}


module.exports = {
  downloadInvoice,
};
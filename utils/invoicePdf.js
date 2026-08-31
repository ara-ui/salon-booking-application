const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const INVOICE_DIR = path.join(__dirname, '..', 'invoices');

function ensureInvoiceDir() {
  if (!fs.existsSync(INVOICE_DIR)) fs.mkdirSync(INVOICE_DIR, { recursive: true });
}

/**
 * Generates a simple one-page invoice PDF and saves it to disk.
 * Returns the absolute file path so the caller can store it / stream it.
 */
function generateInvoicePdf({ appointmentId, customerName, serviceName, staffName, date, startTime, amount }) {
  ensureInvoiceDir();
  const filePath = path.join(INVOICE_DIR, `invoice-appointment-${appointmentId}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('Glow Salon — Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#555').text(`Invoice date: ${new Date().toLocaleDateString()}`);
    doc.text(`Appointment #: ${appointmentId}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(12);
    doc.text(`Billed to: ${customerName}`);
    doc.moveDown();

    doc.text(`Service: ${serviceName}`);
    doc.text(`Staff: ${staffName}`);
    doc.text(`Date: ${date}`);
    doc.text(`Time: ${startTime}`);
    doc.moveDown();
    
    doc.fontSize(14).text(`Amount paid: ₹${Number(amount).toFixed(2)}`);

    doc.moveDown();
    doc.fontSize(12).fillColor('green').text('PAID', { align: 'right' });

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePdf, INVOICE_DIR };

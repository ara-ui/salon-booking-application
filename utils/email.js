const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  // Created lazily so the app doesn't crash on startup if email env vars
  // aren't set yet — only fails when an email is actually sent.
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

// Sending email should never be allowed to break the request that triggered
// it (a booking, a reminder batch). Log and swallow instead of throwing.
async function sendMail({ to, subject, html }) {
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@salon.com',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.warn(`Email to ${to} failed to send (non-fatal):`, err.message);
  }
}

function sendBookingConfirmation({ to, customerName, serviceName, staffName, date, startTime }) {
  return sendMail({
    to,
    subject: 'Your appointment is confirmed',
    html: `
      <p>Hi ${customerName},</p>
      <p>Your appointment is confirmed:</p>
      <ul>
        <li><b>Service:</b> ${serviceName}</li>
        <li><b>Staff:</b> ${staffName}</li>
        <li><b>Date:</b> ${date}</li>
        <li><b>Time:</b> ${startTime}</li>
      </ul>
      <p>See you then!</p>
    `,
  });
}

function sendReminder({ to, customerName, serviceName, date, startTime }) {
  return sendMail({
    to,
    subject: 'Reminder: your appointment is tomorrow',
    html: `
      <p>Hi ${customerName},</p>
      <p>Just a reminder — you have <b>${serviceName}</b> booked for
      <b>${date}</b> at <b>${startTime}</b>.</p>
    `,
  });
}

function sendCancellationNotice({ to, customerName, serviceName, date, startTime }) {
  return sendMail({
    to,
    subject: 'Your appointment has been cancelled',
    html: `
      <p>Hi ${customerName},</p>
      <p>Your <b>${serviceName}</b> appointment on <b>${date}</b> at
      <b>${startTime}</b> has been cancelled.</p>
    `,
  });
}

module.exports = { sendMail, sendBookingConfirmation, sendReminder, sendCancellationNotice };

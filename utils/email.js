const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
 
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}
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

function sendPasswordResetEmail({ to, name, resetUrl }) {
  return sendMail({
    to,
    subject: 'Reset your Glow Salon password',
    html: `
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to choose a new one —
      it's valid for <b>30 minutes</b> and can only be used once:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    `,
  });
}

module.exports = { sendMail, sendBookingConfirmation, sendReminder, sendCancellationNotice, sendPasswordResetEmail };

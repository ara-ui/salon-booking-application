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
      // Without explicit timeouts, a stalled/blocked SMTP handshake falls
      // back to Node's default (very long) socket timeout, which is what
      // was causing emails to sometimes take several minutes. These make it
      // fail fast instead — sendMail() already treats failures as non-fatal.
      connectionTimeout: 10000, // max time to establish the TCP connection
      greetingTimeout: 10000,   // max time to wait for the SMTP server's greeting
      socketTimeout: 20000,     // max time of inactivity on the socket during the send
    });
  }
  return transporter;
}

// Sending email should never be allowed to break the request that triggered
// it (a booking, a reminder batch). Log and swallow instead of throwing.
async function sendMail({ to, subject, html }) {
  const startedAt = Date.now();
  try {
    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@salon.com',
      to,
      subject,
      html,
    });
    // Timing only — never log subject/html, which can contain reset links/tokens.
    console.log(`[email] sent to ${to} in ${Date.now() - startedAt}ms (messageId: ${info.messageId})`);
  } catch (err) {
    console.warn(`[email] to ${to} failed after ${Date.now() - startedAt}ms (non-fatal):`, err.message);
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
      it's valid for <b>10 minutes</b> and can only be used once:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    `,
  });
}

module.exports = { sendMail, sendBookingConfirmation, sendReminder, sendCancellationNotice, sendPasswordResetEmail };
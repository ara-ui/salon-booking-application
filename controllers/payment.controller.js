const { Appointment, Service, Staff, User, Payment, Invoice } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { getStripe } = require('../utils/stripeClient');
const { generateInvoicePdf } = require('../utils/invoicePdf');

async function createCheckoutSession(req, res) {
  const { appointmentId } = req.body;
  if (!appointmentId) throw new AppError(400, 'appointmentId is required');

  const appointment = await Appointment.findByPk(appointmentId, { include: [Service] });
  if (!appointment) throw new AppError(404, 'Appointment not found');
  if (appointment.customerId !== req.user.id) throw new AppError(403, 'Not your appointment');
  if (appointment.paymentStatus === 'paid') throw new AppError(400, 'This appointment is already paid');

  const payment = await Payment.create({
    appointmentId: appointment.id,
    amount: appointment.Service.price,
    status: 'pending',
  });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: appointment.Service.name },
        unit_amount: Math.round(Number(appointment.Service.price) * 100),
      },
      quantity: 1,
    }],
    success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment-success?appointmentId=${appointment.id}`,
    cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment-cancelled`,
    metadata: { appointmentId: String(appointment.id), paymentId: String(payment.id) },
  });

  payment.stripeSessionId = session.id;
  await payment.save();

  res.json({ url: session.url, sessionId: session.id });
}

// Stripe calls this directly. Must be mounted with a RAW body parser (see
// server.js) — signature verification needs the untouched request body.
async function handleWebhook(req, res) {
  const stripe = getStripe();
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const payment = await Payment.findOne({ where: { stripeSessionId: session.id } });
    if (payment) {
      payment.status = 'succeeded';
      await payment.save();

      const appointment = await Appointment.findByPk(payment.appointmentId, {
        include: [Service, { model: Staff, include: [User] }, { model: User, as: 'customer' }],
      });
      appointment.paymentStatus = 'paid';
      await appointment.save();

      // Generate the invoice now that payment is confirmed. The download
      // endpoint (GET /appointments/:id/invoice) reconstructs the same file
      // path from the appointment id, so we don't need to store it here.
      await generateInvoicePdf({
        appointmentId: appointment.id,
        customerName: appointment.customer.name,
        serviceName: appointment.Service.name,
        staffName: appointment.Staff.User.name,
        date: appointment.date,
        startTime: appointment.startTime,
        amount: payment.amount,
      });

      await Invoice.create({
        appointmentId: appointment.id,
        paymentId: payment.id,
        amount: payment.amount,
        pdfUrl: `/api/appointments/${appointment.id}/invoice`, // gated download endpoint, not a raw file path
      });
    }
  }

  res.json({ received: true });
}

module.exports = { createCheckoutSession, handleWebhook };

const { Appointment, Service, Payment } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { getStripe } = require('../utils/stripeClient');
const { maybeGenerateInvoice } = require('../utils/invoiceService');

// Base URL of the frontend the customer lands back on after Stripe checkout.
// Defaults to this app's own origin (the frontend is served by this same
// Express app at localhost:5000, not a separate localhost:3000 app) — set
// CLIENT_URL in production to override with the real deployed domain.
const FRONTEND_BASE_URL = process.env.CLIENT_URL || 'http://localhost:5000';

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
    success_url: `${FRONTEND_BASE_URL}/html/customer.html?appointmentId=${appointment.id}`,
    cancel_url: `${FRONTEND_BASE_URL}/html/customer.html?payment=cancelled`,
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

      const appointment = await Appointment.findByPk(payment.appointmentId);
      appointment.paymentStatus = 'paid';
      await appointment.save();

      // Only actually generates an invoice if the appointment is ALSO
      // already 'completed' — otherwise it's generated later, when
      // updateAppointmentStatus marks it completed. See utils/invoiceService.js.
      await maybeGenerateInvoice(appointment.id);
    }
  }

  res.json({ received: true });
}

module.exports = { createCheckoutSession, handleWebhook };

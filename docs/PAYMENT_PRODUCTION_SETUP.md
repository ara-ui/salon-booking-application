# Glam Up — Cashfree Payment Setup

## Payment state machine

```text
BOOKED / RESCHEDULED
        |
        | appointment time ends
        v
Customer generates completion code
        |
        | assigned staff/admin verifies code
        v
COMPLETED + UNPAID
        |
        | Pay Now
        v
Cashfree order + hosted checkout
        |
        +-----------------------------+
        |                             |
        v                             v
Cashfree webhook              Browser verification
        |                             |
        +-------------+---------------+
                      |
                      v
          Server-side Cashfree check
                      |
                      v
          settleSuccessfulPayment()
                      |
                      v
             COMPLETED + PAID
                      |
                      v
                  Invoice
```

The completion-code flow never marks an appointment as paid.

## Local development

Use a local `.env` based on `.env.example`.

For the current Salon setup:

```env
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:3001
APP_URL=https://YOUR-SALON-NGROK-URL
CASHFREE_ENVIRONMENT=SANDBOX
CASHFREE_APP_ID=YOUR_SANDBOX_APP_ID
CASHFREE_SECRET_KEY=YOUR_SANDBOX_SECRET
```

The Cashfree webhook endpoint is:

```text
https://YOUR-SALON-NGROK-URL/purchase/webhook/cashfree
```

Update the corresponding Cashfree Sandbox webhook configuration.

If the customer returns through the Cashfree return URL, `APP_URL` must point to the externally reachable Salon application.

## Database migration

For an existing database, run:

```text
migrations/001_payment_hardening.sql
```

before using the new application code.

The migration:

- snapshots the service price onto the appointment;
- prevents duplicate Cashfree order IDs;
- prevents duplicate Cashfree payment IDs;
- adds payment lookup indexes.

Do not use `sequelize.sync({ alter: true })` in production.

## Webhook security

The webhook:

1. receives the raw request body;
2. verifies `x-webhook-signature`;
3. verifies `x-webhook-timestamp`;
4. rejects stale/replayed requests;
5. validates the signed amount;
6. independently fetches the Cashfree order/payment;
7. settles only through the shared settlement service.

Cashfree requires webhook signature verification using the timestamp plus the exact raw body. Keep the webhook route before `express.json()`.

## Browser verification

The browser callback is never treated as proof of payment.

The frontend calls:

```text
POST /api/payments/verify
```

The backend independently queries Cashfree.

Possible result:

- `200` — payment successfully verified and settled.
- `202` — Cashfree has not exposed a successful transaction yet; retry is safe.
- `400` — expired/failed/mismatched payment.
- `403` — payment does not belong to the logged-in customer.
- `404` — local payment/order mapping does not exist.

## Production checklist

Before moving from Sandbox to Production:

- use production Cashfree credentials;
- set `CASHFREE_ENVIRONMENT=PRODUCTION`;
- set `NODE_ENV=production`;
- use an HTTPS `APP_URL`;
- configure the production Cashfree webhook;
- run the database migration;
- set a strong random `JWT_SECRET`;
- use a real SMTP credential/app password;
- do not commit `.env`;
- do not enable `DB_SYNC=true`;
- use a persistent/shared rate limiter when running multiple application instances;
- verify Cashfree success, failure, and user-dropped webhook events;
- verify duplicate webhook delivery does not create a duplicate payment/invoice;
- verify a failed payment can be retried;
- verify an expired order creates a fresh order;
- verify a service-price change after booking does not change the booked appointment's payment amount.

## Important credential rule

Never place Cashfree secret keys, SMTP passwords, database passwords, or JWT secrets in source control or a ZIP shared with recruiters.

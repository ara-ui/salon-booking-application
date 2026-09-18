# Glam Up — Salon Booking Application

Node.js/Express salon booking application with customer, staff, and admin workflows.

## Stack

- Node.js + Express
- MySQL + Sequelize
- Vanilla HTML/CSS/JavaScript
- JWT authentication
- Cashfree Payment Gateway
- PDF invoices
- SMTP email notifications
- Swagger API documentation

## Run locally

```bash
npm install
```

Create `.env` from `.env.example` and configure MySQL, JWT, SMTP, and Cashfree Sandbox credentials.

For the current local Salon setup:

```env
PORT=3001
CLIENT_URL=http://localhost:3001
APP_URL=https://YOUR-SALON-NGROK-URL
CASHFREE_ENVIRONMENT=SANDBOX
```

Then:

```bash
npm start
```

Open:

```text
http://localhost:3001/html/index.html
```

Swagger:

```text
http://localhost:3001/api-docs
```

Health:

```text
http://localhost:3001/api/health
```

Readiness:

```text
http://localhost:3001/api/ready
```

## Database

This project intentionally does not run `sequelize.sync({ alter: true })`.

For an existing database, run the SQL migration in:

```text
migrations/001_payment_hardening.sql
```

The migration adds:

- appointment service-price snapshots;
- unique Cashfree order/payment identifiers;
- payment lookup indexes.

## Payment architecture

The payment flow is:

```text
Appointment completed
        ↓
Customer generates completion code
        ↓
Assigned staff verifies code
        ↓
Appointment COMPLETED + UNPAID
        ↓
Customer opens Cashfree checkout
        ↓
Cashfree success
        ↓
Webhook + browser verification
        ↓
Server-side Cashfree verification
        ↓
settleSuccessfulPayment()
        ↓
Appointment COMPLETED + PAID
        ↓
Invoice
```

The browser never directly marks an appointment as paid.

See:

```text
docs/PAYMENT_PRODUCTION_SETUP.md
docs/SECURITY_NOTES.md
```

## Tests

```bash
npm test
```

The current test suite covers availability/validation and Cashfree webhook signature verification.

## Production

Before production:

1. run the database migration;
2. use production Cashfree credentials;
3. set `CASHFREE_ENVIRONMENT=PRODUCTION`;
4. use an HTTPS `APP_URL`;
5. configure the production Cashfree webhook;
6. use a strong random JWT secret;
7. configure real SMTP credentials;
8. keep `.env` out of source control;
9. keep `DB_SYNC=false`;
10. use a shared rate limiter if multiple Node instances are deployed.

Never share Cashfree secret keys, SMTP passwords, database passwords, or JWT secrets.

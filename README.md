# Glam Up --- Salon Booking & Management System

Glam Up is a full-stack salon booking and management application built
with Node.js, Express, MySQL, Sequelize, JWT authentication, and
Cashfree payments.

## Features

### Customer

-   Customer registration and login
-   Browse salon services
-   View available staff
-   Book appointments
-   Reschedule and cancel appointments
-   Appointment status tracking
-   Service-completion verification using a one-time code
-   Cashfree payment after service completion
-   Download/view invoices
-   Submit reviews and feedback
-   Forgot-password and password-reset flow

### Staff

-   Staff authentication
-   View assigned appointments
-   Verify customer completion codes
-   Manage appointment workflow
-   View assigned services and working schedule

### Admin

-   Admin authentication
-   Manage services
-   Manage staff
-   Assign services to staff
-   Configure working hours, holidays, and special dates
-   Manage appointments
-   Manage customers/staff status
-   View operational information

### Payments

-   Cashfree payment integration
-   Sandbox/production environment support
-   Payment verification
-   Cashfree webhook handling
-   Idempotent payment settlement
-   Invoice generation
-   Appointment service price frozen at booking time

## Technology Stack

-   Node.js
-   Express.js
-   MySQL
-   Sequelize
-   JWT
-   bcrypt
-   Cashfree Payments
-   HTML, CSS and JavaScript
-   Swagger/OpenAPI

## Main Payment Flow

``` text
Customer books appointment
        ↓
Service price is frozen at booking time
        ↓
Appointment takes place
        ↓
Customer generates completion code
        ↓
Staff verifies completion code
        ↓
Appointment becomes COMPLETED + UNPAID
        ↓
Customer pays through Cashfree
        ↓
Server verifies payment / receives webhook
        ↓
Payment is settled idempotently
        ↓
Invoice is generated
```

## Project Structure

``` text
salon_booking_application/
├── config/
├── controllers/
├── docs/
├── migrations/
├── middleware/
├── models/
├── public/
├── routes/
├── services/
├── test/
├── utils/
├── invoices/
├── server.js
├── package.json
└── README.md
```

## Environment Variables

Create a local `.env` file with the values required by the application.

Do **not** commit `.env` to Git.

Production configuration should use:

-   MySQL production database
-   Strong JWT secret
-   HTTPS application URL
-   Cashfree production credentials
-   Appropriate client/frontend URL
-   `APP_TIMEZONE=Asia/Kolkata` unless another supported timezone is
    intentionally required

See:

-   `docs/PAYMENT_PRODUCTION_SETUP.md`
-   `docs/SECURITY_NOTES.md`

for payment and security-related deployment information.

## Installation

``` bash
npm install
```

## Run locally

``` bash
node server.js
```

For development, use the project's configured development script if
available:

``` bash
npm run dev
```

## Testing

Run the complete test suite:

``` bash
npm test
```

The project includes tests covering:

-   Appointment availability
-   Working hours and special dates
-   Validation
-   Production environment validation
-   Timezone handling
-   Frozen service pricing
-   Cashfree environment configuration
-   Payment settlement/invoice idempotency
-   Password-reset token log redaction
-   Public staff data exposure
-   Cashfree webhook signature verification

## Database Migration

Production database changes should be applied using the project's
migration process.

Do not rely on development database synchronization for production.

In particular, the payment-hardening migration includes the appointment
service-price changes used to preserve the price agreed at booking time.

## API Documentation

Swagger/OpenAPI configuration is included in the project.

The Swagger configuration is kept in the project for API documentation
and development/reference purposes.

## Security Notes

The application includes:

-   JWT authentication
-   Password hashing with bcrypt
-   Password-reset token protection
-   Role-based authorization
-   Password-reset log redaction
-   Cashfree webhook signature verification
-   Payment amount verification
-   Idempotent payment settlement
-   Public staff-response field restrictions
-   Production environment validation

See `docs/SECURITY_NOTES.md` for the project's security-specific notes.

## Payment Production Setup

See:

`docs/PAYMENT_PRODUCTION_SETUP.md`

before switching Cashfree from Sandbox to Production.

Never commit:

``` text
.env
API keys
payment secrets
database passwords
JWT secrets
```

## Deployment Checklist

Before deployment:

-   [ ] `npm install` completes successfully
-   [ ] `npm test` passes
-   [ ] JavaScript syntax checks pass
-   [ ] Production `.env` values are configured securely
-   [ ] Production MySQL database is ready
-   [ ] Required migrations are applied
-   [ ] `APP_URL` uses HTTPS
-   [ ] Cashfree environment and credentials match the deployment
-   [ ] `APP_TIMEZONE` is configured appropriately
-   [ ] `.env` is not committed
-   [ ] Customer booking flow works
-   [ ] Completion-code flow works
-   [ ] Cashfree payment verification/webhook works
-   [ ] Invoice generation works
-   [ ] Password reset works

## Project Status

Glam Up is a capstone-ready salon booking and management application
with customer, staff, and admin workflows, Cashfree payment integration,
invoice generation, and production-readiness/security hardening.

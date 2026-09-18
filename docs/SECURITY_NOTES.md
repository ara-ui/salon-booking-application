# Security Notes

## Secrets

`.env` is intentionally excluded from the project package.

Create it locally from `.env.example`.

If credentials were previously committed, pasted into a chat, or included in a shared archive, rotate them rather than assuming `.gitignore` makes them safe.

## Payment trust boundary

Only the server can mark a payment successful.

The following browser values are never trusted as payment proof:

- button state;
- Cashfree popup result;
- browser redirect;
- client-side payment status.

The server verifies the Cashfree order/payment and then calls the single settlement service.

## Completion code

The completion code:

- is generated only by the customer;
- is available only after the scheduled appointment end;
- is verified only by the assigned staff member or admin;
- is cleared after successful verification;
- never changes payment state.

## Webhook

The webhook uses:

- raw-body HMAC verification;
- timestamp replay protection;
- amount validation;
- provider-side order/payment reconciliation;
- idempotent settlement.

## Database schema

Production schema changes must be applied through migrations.

Do not use `sequelize.sync({ alter: true })`.

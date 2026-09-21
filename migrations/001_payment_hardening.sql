-- Glam Up / Salon Booking System
-- Payment hardening migration
--
-- Run this ONCE against the existing MySQL database before starting the
-- application with the new payment code.
--
-- Do NOT use Sequelize sync({ alter: true }) in production.
--
-- If the database was created by DB_SYNC from the CURRENT models, the
-- appointments.servicePrice column already exists: skip step 1 (its ALTER
-- would fail with a duplicate column error) and run steps 2 and 3 only.

START TRANSACTION;

-- 1. Freeze the service price at booking time.
ALTER TABLE appointments
  ADD COLUMN servicePrice DECIMAL(10,2) NULL AFTER serviceId;

UPDATE appointments a
JOIN services s ON s.id = a.serviceId
SET a.servicePrice = s.price
WHERE a.servicePrice IS NULL;

-- 2. Prevent the same Cashfree order or provider payment from being mapped
-- to more than one local payment record.
ALTER TABLE payments
  ADD UNIQUE INDEX uq_payments_provider_order_id (providerOrderId),
  ADD UNIQUE INDEX uq_payments_provider_payment_id (providerPaymentId);

-- 3. Index the most common payment lookups.
CREATE INDEX idx_payments_appointment_id
  ON payments (appointmentId);

CREATE INDEX idx_payments_status
  ON payments (status);

COMMIT;

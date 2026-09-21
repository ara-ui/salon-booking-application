const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Simulates browser verification and the Cashfree webhook settling the same
// payment at the same moment: both reach maybeGenerateInvoice() and both see
// "no invoice yet". Invoice.appointmentId is unique in the real database.

function stubModule(relativePath, exports) {
  const filename = require.resolve(relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
}

const INVOICE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'glam-invoices-'));

let invoices;
let barrier;
let createError;

function uniqueConstraintError() {
  const err = new Error('Validation error');
  err.name = 'SequelizeUniqueConstraintError';
  return err;
}

// Releases every waiter once `parties` callers have arrived.
function makeBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  return async function wait() {
    arrived += 1;
    if (arrived >= parties) release();
    await gate;
  };
}

const appointment = {
  id: 1,
  paymentStatus: 'paid',
  date: '2026-09-21',
  startTime: '10:00',
  customer: { name: 'Asha' },
  Service: { name: 'Haircut' },
  Staff: { User: { name: 'Meera' } },
};

stubModule('../models', {
  Appointment: { findByPk: async () => appointment },
  Service: {},
  Staff: {},
  User: {},
  Payment: {
    findOne: async () => ({ id: 11, amount: '500.00', status: 'succeeded' }),
  },
  Invoice: {
    findOne: async ({ where }) => {
      if (barrier) await barrier();
      return invoices.find((i) => i.appointmentId === where.appointmentId) || null;
    },
    create: async (values) => {
      await new Promise((resolve) => setImmediate(resolve));

      if (createError) throw createError;

      if (invoices.some((i) => i.appointmentId === values.appointmentId)) {
        throw uniqueConstraintError();
      }

      const invoice = { id: invoices.length + 1, ...values };
      invoices.push(invoice);
      return invoice;
    },
  },
});

stubModule('../utils/invoicePdf', {
  INVOICE_DIR,
  generateInvoicePdf: async ({ appointmentId }) => {
    const filePath = path.join(INVOICE_DIR, `invoice-appointment-${appointmentId}.pdf`);
    fs.writeFileSync(filePath, 'fake-pdf');
    return filePath;
  },
});

const { maybeGenerateInvoice } = require('../utils/invoiceService');

test.beforeEach(() => {
  invoices = [];
  barrier = null;
  createError = null;
  fs.rmSync(path.join(INVOICE_DIR, 'invoice-appointment-1.pdf'), { force: true });
});

test.after(() => {
  fs.rmSync(INVOICE_DIR, { recursive: true, force: true });
});

test('two simultaneous settlements produce one invoice and no error', async () => {
  barrier = makeBarrier(2);

  const [a, b] = await Promise.all([
    maybeGenerateInvoice(1),
    maybeGenerateInvoice(1),
  ]);

  assert.equal(invoices.length, 1, 'exactly one invoice row must exist');
  assert.equal(a.id, invoices[0].id);
  assert.equal(b.id, invoices[0].id);
  assert.equal(a.amount, '500.00');
});

test('a repeated call after the invoice exists is a no-op', async () => {
  await maybeGenerateInvoice(1);
  const again = await maybeGenerateInvoice(1);

  assert.equal(invoices.length, 1);
  assert.equal(again.id, invoices[0].id);
});

test('errors other than a duplicate invoice still propagate', async () => {
  createError = new Error('database is down');

  await assert.rejects(() => maybeGenerateInvoice(1), /database is down/);
});

test('a unique-constraint error with no matching invoice is not swallowed', async () => {
  createError = uniqueConstraintError();

  await assert.rejects(
    () => maybeGenerateInvoice(1),
    (err) => err.name === 'SequelizeUniqueConstraintError'
  );
});

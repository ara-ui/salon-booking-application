const test = require('node:test');
const assert = require('node:assert/strict');

// Runs the real bookAppointment() and createCashfreeOrder() controllers against
// an in-memory fake database. Local modules are replaced through require.cache,
// so no MySQL, Sequelize, Cashfree or SMTP access is needed.

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

let db;
let cashfreeCalls;

function record(values) {
  return { ...values, async save() {} };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function futureDate(days = 3) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function everyDay(ranges) {
  return Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, ranges])
  );
}

function resetDb() {
  const hours = everyDay([{ start: '09:00', end: '18:00' }]);

  db = {
    services: [{
      id: 1,
      name: 'Haircut',
      durationMinutes: 60,
      price: '500.00',
      isActive: true,
    }],
    customer: {
      id: 7,
      name: 'Asha',
      email: 'asha@example.com',
      phone: '9876543210',
      isActive: true,
      preferredStaffId: null,
    },
    staff: {
      id: 3,
      workingHours: hours,
      User: { id: 30, name: 'Meera', isActive: true },
    },
    settings: { workingHours: hours, specialDates: [] },
    appointments: [],
    payments: [],
  };

  cashfreeCalls = [];
}

const models = {
  sequelize: {
    transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }),
  },
  Service: {
    findByPk: async (id) =>
      db.services.find((s) => s.id === Number(id)) || null,
  },
  User: {
    findByPk: async (id) => (id === db.customer.id ? db.customer : null),
  },
  Staff: {
    associations: { Services: {} },
    findOne: async () => db.staff,
    findByPk: async () => db.staff,
    findAll: async () => [db.staff],
  },
  SalonSettings: {
    findByPk: async () => db.settings,
  },
  Appointment: {
    findAll: async () =>
      db.appointments.filter((a) => ['booked', 'rescheduled'].includes(a.status)),
    create: async (values) => {
      const appointment = record({ id: db.appointments.length + 1, ...values });
      db.appointments.push(appointment);
      return appointment;
    },
    findByPk: async (id) => {
      const appointment = db.appointments.find((a) => a.id === Number(id));
      if (!appointment) return null;
      // Same as include: [Service] - the LIVE service row, not a snapshot.
      appointment.Service = db.services.find((s) => s.id === appointment.serviceId);
      return appointment;
    },
  },
  Payment: {
    findOne: async ({ where }) =>
      db.payments
        .filter((p) => p.appointmentId === where.appointmentId && p.status === where.status)
        .pop() || null,
    create: async (values) => {
      const payment = record({ id: db.payments.length + 1, ...values });
      db.payments.push(payment);
      return payment;
    },
  },
};

stubModule('../models', models);
stubModule('../utils/email', {
  sendBookingConfirmation: async () => {},
  sendCancellationNotice: async () => {},
  sendReminder: async () => {},
  sendPasswordResetEmail: async () => {},
});
stubModule('../utils/cashfreeClient', {
  getCashfree: () => ({
    PGCreateOrder: async (payload) => {
      cashfreeCalls.push(payload);
      return {
        data: { order_id: payload.order_id, payment_session_id: 'session_1' },
      };
    },
  }),
});
stubModule('../utils/invoiceService', { maybeGenerateInvoice: async () => null });
stubModule('../services/paymentSettlement.service', {
  settleSuccessfulPayment: async () => ({ settled: true }),
});

const { bookAppointment } = require('../controllers/appointment/booking');
const { createCashfreeOrder } = require('../controllers/payment.controller');

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function bookHaircut(startTime = '10:00') {
  const res = makeRes();
  await bookAppointment(
    {
      user: { id: db.customer.id },
      body: { serviceId: 1, date: futureDate(), startTime, staffId: 3 },
    },
    res
  );
  return res;
}

async function checkout(appointmentId = 1) {
  const res = makeRes();
  await createCashfreeOrder(
    { user: { id: db.customer.id }, body: { appointmentId } },
    res
  );
  return res;
}

test.beforeEach(() => {
  resetDb();
  delete process.env.CASHFREE_ENVIRONMENT;
});

test('booking stores the service price at booking time', async () => {
  const res = await bookHaircut();

  assert.equal(res.statusCode, 201);
  assert.equal(db.appointments.length, 1);
  assert.equal(db.appointments[0].servicePrice, '500.00');
});

test('changing Service.price after booking does not change the amount owed', async () => {
  await bookHaircut();

  // Admin raises the price after the appointment was booked...
  db.services[0].price = '900.00';
  // ...and the service is later completed, unlocking payment.
  db.appointments[0].status = 'completed';

  const res = await checkout();

  assert.equal(res.statusCode, 200);
  assert.equal(db.payments.length, 1);
  assert.equal(db.payments[0].amount, '500.00', 'local Payment amount must be the frozen price');
  assert.equal(cashfreeCalls.length, 1);
  assert.equal(cashfreeCalls[0].order_amount, 500, 'Cashfree order amount must be the frozen price');
  assert.equal(
    Number(db.payments[0].amount),
    cashfreeCalls[0].order_amount,
    'payment verification compares these two values, so they must agree'
  );
});

test('an appointment booked before the price change keeps its price; a new booking gets the new one', async () => {
  await bookHaircut('10:00');
  db.services[0].price = '900.00';
  await bookHaircut('13:00'); // different slot, so it does not conflict

  assert.equal(db.appointments.length, 2);
  assert.equal(db.appointments[0].servicePrice, '500.00');
  assert.equal(db.appointments[1].servicePrice, '900.00');
});

test('a legacy appointment with no frozen price is frozen once from the service', async () => {
  db.appointments.push(record({
    id: 1,
    customerId: db.customer.id,
    staffId: 3,
    serviceId: 1,
    servicePrice: null,
    status: 'completed',
    paymentStatus: 'unpaid',
  }));
  db.services[0].price = '750.00';

  await checkout();

  assert.equal(cashfreeCalls[0].order_amount, 750);
  assert.equal(db.appointments[0].servicePrice, '750.00');

  // The price is now stored on the appointment; later service edits cannot move it.
  db.services[0].price = '1000.00';
  assert.equal(db.appointments[0].servicePrice, '750.00');
});

test('checkout tells the browser to use sandbox by default', async () => {
  await bookHaircut();
  db.appointments[0].status = 'completed';

  const res = await checkout();

  assert.equal(res.body.cashfreeMode, 'sandbox');
  assert.equal(res.body.paymentSessionId, 'session_1');
});

test('checkout tells the browser to use production when CASHFREE_ENVIRONMENT=PRODUCTION', async () => {
  process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
  await bookHaircut();
  db.appointments[0].status = 'completed';

  const res = await checkout();

  assert.equal(res.body.cashfreeMode, 'production');
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateEnvironment,
  applyTimezone,
  getCashfreeEnvironment,
} = require('../config/env');
const { hoursUntil } = require('../utils/datetime');
const { isFutureDateTime } = require('../utils/validation');

const ENV_KEYS = [
  'NODE_ENV',
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET',
  'CASHFREE_APP_ID',
  'CASHFREE_SECRET_KEY',
  'CASHFREE_ENVIRONMENT',
  'APP_URL',
  'PORT',
  'APP_TIMEZONE',
  'TZ',
];

// Runs fn with process.env cleared of the keys above and set to `vars`,
// then restores everything (including TZ) afterwards.
function withEnv(vars, fn) {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, vars);

  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

const DEV_MINIMUM = {
  DB_NAME: 'glam',
  DB_USER: 'root',
  JWT_SECRET: 'dev-secret',
};

const VALID_PRODUCTION = {
  NODE_ENV: 'production',
  DB_NAME: 'glam',
  DB_USER: 'glam_app',
  JWT_SECRET: 'x'.repeat(48),
  CASHFREE_APP_ID: 'app_id',
  CASHFREE_SECRET_KEY: 'secret_key',
  CASHFREE_ENVIRONMENT: 'PRODUCTION',
  APP_URL: 'https://glamup.example.com',
};

/* ---------- validateEnvironment: production fails fast ---------- */

test('production accepts a complete, valid configuration', () => {
  const env = withEnv(VALID_PRODUCTION, () => validateEnvironment());

  assert.equal(env.nodeEnv, 'production');
  assert.equal(env.cashfreeEnvironment, 'PRODUCTION');
  assert.equal(env.port, 3000);
  assert.deepEqual(env.warnings, []);
});

test('production refuses to start when Cashfree credentials are missing', () => {
  for (const name of ['CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY']) {
    const vars = { ...VALID_PRODUCTION };
    delete vars[name];

    assert.throws(
      () => withEnv(vars, () => validateEnvironment()),
      new RegExp(name)
    );
  }
});

test('production refuses to start with a missing core variable', () => {
  for (const name of ['DB_NAME', 'DB_USER', 'JWT_SECRET']) {
    const vars = { ...VALID_PRODUCTION };
    delete vars[name];

    assert.throws(
      () => withEnv(vars, () => validateEnvironment()),
      new RegExp(name)
    );
  }
});

test('production rejects the placeholder JWT secret, missing/non-HTTPS APP_URL and sandbox Cashfree', () => {
  const bad = [
    [{ JWT_SECRET: 'change_this_to_a_long_random_string' }, /JWT_SECRET/],
    [{ APP_URL: '' }, /APP_URL is required/],
    [{ APP_URL: 'http://glamup.example.com' }, /HTTPS/],
    [{ CASHFREE_ENVIRONMENT: 'SANDBOX' }, /CASHFREE_ENVIRONMENT must be PRODUCTION/],
    [{ CASHFREE_ENVIRONMENT: '' }, /CASHFREE_ENVIRONMENT must be PRODUCTION/],
  ];

  for (const [override, message] of bad) {
    assert.throws(
      () => withEnv({ ...VALID_PRODUCTION, ...override }, () => validateEnvironment()),
      message
    );
  }
});

test('invalid PORT and invalid APP_TIMEZONE are rejected', () => {
  for (const port of ['abc', '0', '70000', '3000.5']) {
    assert.throws(
      () => withEnv({ ...DEV_MINIMUM, PORT: port }, () => validateEnvironment()),
      /PORT/
    );
  }

  assert.throws(
    () => withEnv({ ...DEV_MINIMUM, APP_TIMEZONE: 'Mars/Olympus_Mons' }, () => validateEnvironment()),
    /APP_TIMEZONE/
  );
});

/* ---------- validateEnvironment: local development keeps working ---------- */

test('development boots without Cashfree credentials and returns a warning', () => {
  const env = withEnv(DEV_MINIMUM, () => validateEnvironment());

  assert.equal(env.nodeEnv, 'development');
  assert.equal(env.cashfreeEnvironment, 'SANDBOX');
  assert.equal(env.warnings.length, 1);
  assert.match(env.warnings[0], /CASHFREE_APP_ID, CASHFREE_SECRET_KEY/);
});

test('development with everything set has no warnings and needs no APP_URL', () => {
  const env = withEnv(
    { ...DEV_MINIMUM, CASHFREE_APP_ID: 'a', CASHFREE_SECRET_KEY: 'b' },
    () => validateEnvironment()
  );

  assert.deepEqual(env.warnings, []);
});

test('development still requires the variables the app cannot run without', () => {
  assert.throws(
    () => withEnv({ DB_NAME: 'glam', DB_USER: 'root' }, () => validateEnvironment()),
    /JWT_SECRET/
  );
});

/* ---------- Cashfree environment ---------- */

test('Cashfree environment defaults to SANDBOX and honours CASHFREE_ENVIRONMENT', () => {
  assert.equal(withEnv({}, () => getCashfreeEnvironment()), 'SANDBOX');
  assert.equal(withEnv({ CASHFREE_ENVIRONMENT: 'sandbox' }, () => getCashfreeEnvironment()), 'SANDBOX');
  assert.equal(withEnv({ CASHFREE_ENVIRONMENT: 'production' }, () => getCashfreeEnvironment()), 'PRODUCTION');
  assert.equal(withEnv({ CASHFREE_ENVIRONMENT: 'PRODUCTION' }, () => getCashfreeEnvironment()), 'PRODUCTION');
});

/* ---------- Timezone ---------- */

test('the process timezone defaults to India (IST, UTC+05:30)', () => {
  withEnv({}, () => {
    assert.equal(applyTimezone(), 'Asia/Kolkata');

    // 10:00 salon time must be 04:30 UTC.
    assert.equal(
      new Date('2026-09-21T10:00:00').toISOString(),
      '2026-09-21T04:30:00.000Z'
    );
  });
});

test('APP_TIMEZONE overrides the default (local development elsewhere)', () => {
  withEnv({ APP_TIMEZONE: 'UTC' }, () => {
    assert.equal(applyTimezone(), 'UTC');
    assert.equal(
      new Date('2026-09-21T10:00:00').toISOString(),
      '2026-09-21T10:00:00.000Z'
    );
  });
});

test('an invalid APP_TIMEZONE throws instead of silently falling back to UTC', () => {
  withEnv({ APP_TIMEZONE: 'Not/AZone' }, () => {
    assert.throws(() => applyTimezone(), /APP_TIMEZONE/);
  });
});

test('booking, cancellation and reschedule windows are evaluated on the salon clock', (t) => {
  // "Now" is 10:00 IST on 2026-09-21 (= 04:30 UTC), whatever the host timezone is.
  t.mock.method(Date, 'now', () => Date.parse('2026-09-21T04:30:00Z'));

  withEnv({}, () => {
    applyTimezone();

    // Exactly 24h to an appointment at 10:00 IST tomorrow: the boundary of the
    // 24-hour customer cancel/reschedule policy. On a UTC host this would read 29.5.
    assert.equal(hoursUntil('2026-09-22', '10:00'), 24);

    // 09:30 IST today is already past; 10:30 IST is still ahead.
    assert.equal(isFutureDateTime('2026-09-21', '09:30'), false);
    assert.equal(isFutureDateTime('2026-09-21', '10:30'), true);
  });
});

const REQUIRED_ALWAYS = [
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET',
];

// Needed only for payments, so local development can still boot without them
// (a warning is returned instead); production refuses to start without them.
const REQUIRED_IN_PRODUCTION = [
  'CASHFREE_APP_ID',
  'CASHFREE_SECRET_KEY',
];

// The salon is India-based. Appointment dates/times are stored as plain
// 'YYYY-MM-DD' / 'HH:MM' salon-local strings and parsed with `new Date(...)`,
// which uses the process timezone, so that must be explicit, not the host's.
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function getAppTimezone() {
  return String(process.env.APP_TIMEZONE || '').trim() || DEFAULT_TIMEZONE;
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function applyTimezone() {
  const timezone = getAppTimezone();

  if (!isValidTimezone(timezone)) {
    throw new Error(
      'APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Kolkata'
    );
  }

  process.env.TZ = timezone;
  return timezone;
}

function getCashfreeEnvironment() {
  return String(process.env.CASHFREE_ENVIRONMENT || 'SANDBOX').toUpperCase();
}

function validateEnvironment() {
  const nodeEnv =
    String(process.env.NODE_ENV || 'development')
      .toLowerCase();

  const missing = REQUIRED_ALWAYS.filter(
    (name) => !String(process.env[name] || '').trim()
  );

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  const warnings = [];

  const missingPaymentConfig = REQUIRED_IN_PRODUCTION.filter(
    (name) => !String(process.env[name] || '').trim()
  );

  if (missingPaymentConfig.length) {
    if (nodeEnv === 'production') {
      throw new Error(
        `Missing required production environment variables: ${missingPaymentConfig.join(', ')}`
      );
    }

    warnings.push(
      `Missing ${missingPaymentConfig.join(', ')}: Cashfree payments will not work until these are set.`
    );
  }

  if (
    nodeEnv === 'production' &&
    process.env.JWT_SECRET === 'change_this_to_a_long_random_string'
  ) {
    throw new Error(
      'JWT_SECRET must be changed before starting in production'
    );
  }

  if (
    nodeEnv === 'production' &&
    !process.env.APP_URL
  ) {
    throw new Error(
      'APP_URL is required in production'
    );
  }

  if (
    nodeEnv === 'production' &&
    !String(process.env.APP_URL || '').startsWith('https://')
  ) {
    throw new Error(
      'APP_URL must use HTTPS in production'
    );
  }


  const port =
    Number(process.env.PORT || 3000);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'PORT must be a valid TCP port'
    );
  }

  const cashfreeEnvironment =
    String(
      process.env.CASHFREE_ENVIRONMENT ||
      'SANDBOX'
    ).toUpperCase();

  if (
    !['SANDBOX', 'PRODUCTION'].includes(
      cashfreeEnvironment
    )
  ) {
    throw new Error(
      'CASHFREE_ENVIRONMENT must be SANDBOX or PRODUCTION'
    );
  }

  if (!isValidTimezone(getAppTimezone())) {
    throw new Error(
      'APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Kolkata'
    );
  }

  return {
    nodeEnv,
    port,
    cashfreeEnvironment,
    timezone: getAppTimezone(),
    warnings,
  };
}

module.exports = {
  validateEnvironment,
  applyTimezone,
  getAppTimezone,
  getCashfreeEnvironment,
};

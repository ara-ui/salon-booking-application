const REQUIRED_ALWAYS = [
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET',
  'CASHFREE_APP_ID',
  'CASHFREE_SECRET_KEY',
];

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

  if (
    nodeEnv === 'production' &&
    String(process.env.CASHFREE_ENVIRONMENT || 'SANDBOX').toUpperCase() !== 'PRODUCTION'
  ) {
    throw new Error(
      'CASHFREE_ENVIRONMENT must be PRODUCTION when NODE_ENV=production'
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

  return {
    nodeEnv,
    port,
    cashfreeEnvironment,
  };
}

module.exports = {
  validateEnvironment,
};

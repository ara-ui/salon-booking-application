const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { getCashfreeEnvironment } = require('../config/env');

let cashfreeInstance;

function getCashfree() {
  if (!cashfreeInstance) {
    cashfreeInstance = new Cashfree(
      getCashfreeEnvironment() === 'PRODUCTION'
        ? CFEnvironment.PRODUCTION
        : CFEnvironment.SANDBOX,
      process.env.CASHFREE_APP_ID,
      process.env.CASHFREE_SECRET_KEY
    );
  }
  return cashfreeInstance;
}

module.exports = { getCashfree };

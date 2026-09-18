const { Cashfree, CFEnvironment } = require('cashfree-pg');

let cashfreeInstance;

function getCashfree() {
  if (!cashfreeInstance) {
    cashfreeInstance = new Cashfree(
      CFEnvironment.SANDBOX,
      process.env.CASHFREE_APP_ID,
      process.env.CASHFREE_SECRET_KEY
    );
  }
  return cashfreeInstance;
}

module.exports = { getCashfree };

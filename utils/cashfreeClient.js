const { Cashfree, CFEnvironment } = require('cashfree-pg');

let cashfreeInstance;

/**
 * Returns a lazily-created Cashfree SDK instance configured for Sandbox.
 * Kept in its own module (same isolation pattern the old stripeClient.js
 * used) so credentials and SDK setup live in exactly one place, and so
 * this can be swapped for a fake implementation in tests without touching
 * the real credentials or the controller that uses it.
 *
 * NOTE on SDK version: the installed cashfree-pg (v6) calls PGCreateOrder /
 * PGOrderFetchPayments as INSTANCE methods on a Cashfree object, unlike
 * older versions where these were static calls like `Cashfree.PGCreateOrder(...)`.
 * The request/response field names (order_amount, customer_details,
 * payment_session_id, cf_payment_id, payment_status) are unchanged.
 */
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

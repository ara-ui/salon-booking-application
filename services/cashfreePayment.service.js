const { getCashfree } = require('../utils/cashfreeClient');

async function fetchOrder(orderId) {
  const cashfree = getCashfree();
  const response = await cashfree.PGFetchOrder(orderId);
  return response?.data || {};
}

async function fetchOrderPayments(orderId) {
  const cashfree = getCashfree();
  const response = await cashfree.PGOrderFetchPayments(orderId);
  return Array.isArray(response?.data) ? response.data : [];
}

function findSuccessfulPayment(payments) {
  return payments.find(
    (payment) =>
      String(payment?.payment_status || '').toUpperCase() === 'SUCCESS'
  ) || null;
}

function findLatestPayment(payments) {
  if (!payments.length) return null;

  return [...payments].sort((a, b) => {
    const aTime =
      Date.parse(a?.payment_time || '') || 0;
    const bTime =
      Date.parse(b?.payment_time || '') || 0;

    return bTime - aTime;
  })[0];
}

async function fetchSuccessfulPayment(orderId) {
  const payments = await fetchOrderPayments(orderId);
  return findSuccessfulPayment(payments);
}

function isOrderActive(order) {
  return (
    String(order?.order_status || '').toUpperCase() === 'ACTIVE' &&
    Boolean(order?.payment_session_id)
  );
}

function isOrderPaid(order) {
  return String(order?.order_status || '').toUpperCase() === 'PAID';
}

function isOrderExpired(order) {
  return ['EXPIRED', 'TERMINATED'].includes(
    String(order?.order_status || '').toUpperCase()
  );
}

async function createOrder(orderPayload) {
  const cashfree = getCashfree();
  const response = await cashfree.PGCreateOrder(orderPayload);
  return response?.data || {};
}

module.exports = {
  fetchOrder,
  fetchOrderPayments,
  fetchSuccessfulPayment,
  findSuccessfulPayment,
  findLatestPayment,
  isOrderActive,
  isOrderPaid,
  isOrderExpired,
  createOrder,
};

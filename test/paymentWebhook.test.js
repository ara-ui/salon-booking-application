const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  verifyCashfreeSignature,
} = require('../utils/cashfreeWebhook');

function makeRequest({
  secret,
  timestamp,
  rawBody,
  signatureOverride,
} = {}) {
  process.env.CASHFREE_SECRET_KEY =
    secret || 'test-secret';

  const actualTimestamp =
    timestamp || String(Date.now());

  const actualBody =
    rawBody || JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: {
          order_id: 'SALON_ORDER_1_123',
          order_amount: 500,
        },
        payment: {
          cf_payment_id: '12345',
          payment_status: 'SUCCESS',
          payment_amount: 500,
        },
      },
    });

  const signature =
    signatureOverride ||
    crypto
      .createHmac(
        'sha256',
        process.env.CASHFREE_SECRET_KEY
      )
      .update(
        actualTimestamp + actualBody
      )
      .digest('base64');

  return {
    get(name) {
      const normalized =
        String(name).toLowerCase();

      if (
        normalized ===
        'x-webhook-signature'
      ) {
        return signature;
      }

      if (
        normalized ===
        'x-webhook-timestamp'
      ) {
        return actualTimestamp;
      }

      return undefined;
    },
  };
}

test('Cashfree webhook signature accepts the exact raw payload', () => {
  const body =
    '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{}}';

  const req =
    makeRequest({
      rawBody: body,
    });

  assert.equal(
    verifyCashfreeSignature({
      signature: req.get('x-webhook-signature'),
      timestamp: req.get('x-webhook-timestamp'),
      rawBody: body,
      secret: process.env.CASHFREE_SECRET_KEY,
    }),
    true
  );
});

test('Cashfree webhook signature rejects a modified payload', () => {
  const original =
    '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{}}';

  const req =
    makeRequest({
      rawBody: original,
    });

  assert.equal(
    verifyCashfreeSignature({
      signature: req.get('x-webhook-signature'),
      timestamp: req.get('x-webhook-timestamp'),
      rawBody: '{"type":"PAYMENT_FAILED_WEBHOOK","data":{}}',
      secret: process.env.CASHFREE_SECRET_KEY,
    }),
    false
  );
});

test('Cashfree webhook signature rejects a stale timestamp', () => {
  const stale =
    String(
      Date.now() -
        10 * 60 * 1000
    );

  const body =
    '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{}}';

  const req =
    makeRequest({
      timestamp: stale,
      rawBody: body,
    });

  assert.equal(
    verifyCashfreeSignature({
      signature: req.get('x-webhook-signature'),
      timestamp: req.get('x-webhook-timestamp'),
      rawBody: body,
      secret: process.env.CASHFREE_SECRET_KEY,
    }),
    false
  );
});

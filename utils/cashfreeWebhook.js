const crypto = require('crypto');

const DEFAULT_TOLERANCE_MS =
  5 * 60 * 1000;

function verifyCashfreeSignature({
  signature,
  timestamp,
  rawBody,
  secret,
  toleranceMs =
    Number(
      process.env.CASHFREE_WEBHOOK_TOLERANCE_MS ||
      DEFAULT_TOLERANCE_MS
    ),
  now = Date.now(),
}) {
  if (
    !signature ||
    !timestamp ||
    !secret ||
    rawBody == null
  ) {
    return false;
  }

  const timestampNumber =
    Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  if (
    Math.abs(
      now - timestampNumber
    ) > toleranceMs
  ) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(
        timestamp + rawBody
      )
      .digest('base64');

  const receivedBuffer =
    Buffer.from(
      String(signature),
      'utf8'
    );

  const expectedBuffer =
    Buffer.from(
      expected,
      'utf8'
    );

  return (
    receivedBuffer.length ===
      expectedBuffer.length &&
    crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    )
  );
}

module.exports = {
  verifyCashfreeSignature,
};

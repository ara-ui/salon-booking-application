const crypto = require('crypto');

const RESET_TOKEN_TTL_MINUTES = 30;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}


function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  };
}

module.exports = { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MINUTES };


const TOKEN_QUERY_PARAM = /([?&]token=)[^&#\s"]*/gi;

function redactSensitiveQuery(value) {
  if (typeof value !== 'string') return value;
  return value.replace(TOKEN_QUERY_PARAM, '$1[REDACTED]');
}

function registerLogRedaction(morgan) {
  morgan.token('url', (req) =>
    redactSensitiveQuery(req.originalUrl || req.url)
  );

  morgan.token('referrer', (req) =>
    redactSensitiveQuery(req.headers.referer || req.headers.referrer)
  );
}

module.exports = { redactSensitiveQuery, registerLogRedaction };

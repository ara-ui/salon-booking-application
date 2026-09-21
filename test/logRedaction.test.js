const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  redactSensitiveQuery,
  registerLogRedaction,
} = require('../utils/logRedaction');

const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';

test('redacts the reset token in a page URL and keeps the rest', () => {
  assert.equal(
    redactSensitiveQuery(`/html/reset-password.html?token=${SECRET}`),
    '/html/reset-password.html?token=[REDACTED]'
  );
});

test('redacts the token in the API validation URL and preserves other params', () => {
  assert.equal(
    redactSensitiveQuery(`/api/auth/validate-reset-token?token=${SECRET}`),
    '/api/auth/validate-reset-token?token=[REDACTED]'
  );
  assert.equal(
    redactSensitiveQuery(`/x?a=1&token=${SECRET}&b=2`),
    '/x?a=1&token=[REDACTED]&b=2'
  );
});

test('redacts a full Referer URL', () => {
  assert.equal(
    redactSensitiveQuery(`https://glamup.example.com/html/reset-password.html?token=${SECRET}`),
    'https://glamup.example.com/html/reset-password.html?token=[REDACTED]'
  );
});

test('leaves ordinary URLs, look-alike params and non-strings untouched', () => {
  assert.equal(redactSensitiveQuery('/api/services?active=1'), '/api/services?active=1');
  assert.equal(redactSensitiveQuery('/x?mytoken=abc'), '/x?mytoken=abc');
  assert.equal(redactSensitiveQuery(undefined), undefined);
});

test('registerLogRedaction overrides the :url and :referrer tokens', () => {
  const tokens = {};
  registerLogRedaction({ token: (name, fn) => { tokens[name] = fn; } });

  assert.deepEqual(Object.keys(tokens).sort(), ['referrer', 'url']);
  assert.equal(
    tokens.url({ originalUrl: `/html/reset-password.html?token=${SECRET}` }),
    '/html/reset-password.html?token=[REDACTED]'
  );
  assert.equal(
    tokens.referrer({ headers: { referer: `http://h/html/reset-password.html?token=${SECRET}` } }),
    'http://h/html/reset-password.html?token=[REDACTED]'
  );
  assert.equal(tokens.referrer({ headers: {} }), undefined);
});

let morgan = null;
try { morgan = require('morgan'); } catch { /* not installed in this environment */ }

async function logLine(format, { path, headers }) {
  registerLogRedaction(morgan);

  let resolveLine;
  const line = new Promise((resolve) => { resolveLine = resolve; });
  const logger = morgan(format, { stream: { write: resolveLine } });
  const server = http.createServer((req, res) => logger(req, res, () => res.end('ok')));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path, headers }, (res) => {
      res.resume();
      res.on('end', resolve);
    }).on('error', reject);
  });

  const written = await line;
  server.close();
  server.closeAllConnections?.();
  return written;
}

test('real Morgan "combined" never writes the token (URL or Referer)',
  { skip: !morgan && 'morgan is not installed' },
  async () => {
    const written = await logLine('combined', {
      path: `/html/reset-password.html?token=${SECRET}`,
      headers: { Referer: `http://localhost/html/reset-password.html?token=${SECRET}` },
    });

    assert.ok(!written.includes(SECRET), `token leaked: ${written}`);
    assert.match(written, /GET \/html\/reset-password\.html\?token=\[REDACTED\] HTTP\/1\.1" 200/);
    assert.match(written, /"http:\/\/localhost\/html\/reset-password\.html\?token=\[REDACTED\]"/);
  });

test('real Morgan "dev" never writes the token but still logs the request',
  { skip: !morgan && 'morgan is not installed' },
  async () => {
    const written = await logLine('dev', {
      path: `/api/auth/validate-reset-token?token=${SECRET}`,
      headers: {},
    });

    assert.ok(!written.includes(SECRET), `token leaked: ${written}`);
    assert.match(written, /GET \/api\/auth\/validate-reset-token\?token=\[REDACTED\]/);
    assert.match(written, /200/);
  });

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// staff.controller requires bcryptjs at load time; it is not used by the
// read handlers under test, so a stand-in keeps this test dependency-free.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'bcryptjs') return {};
  return originalLoad.call(this, request, ...rest);
};

function stubModule(relativePath, exports) {
  const filename = require.resolve(relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}

const User = { name: 'User' };
const Service = { name: 'Service' };
let lastOptions;
let staffRow;

stubModule('../models', {
  User,
  Service,
  Staff: {
    findAll: async (options) => { lastOptions = options; return []; },
    findByPk: async (id, options) => { lastOptions = options; return staffRow; },
  },
});

const { listStaff, getStaff, listAllStaff } = require('../controllers/staff.controller');

const res = () => ({ json(body) { this.body = body; return this; } });
const userAttributes = (options) =>
  options.include.find((i) => i.model === User).attributes;

test('GET /staff does not request staff email addresses', async () => {
  await listStaff({}, res());
  const attributes = userAttributes(lastOptions);

  assert.ok(!attributes.includes('email'));
  // Fields the customer and staff pages actually read.
  assert.ok(attributes.includes('id') && attributes.includes('name'));
});

test('GET /staff/:id (also unauthenticated) does not request email either', async () => {
  staffRow = { id: 1, User: { isActive: true } };
  await getStaff({ params: { id: 1 } }, res());

  assert.ok(!userAttributes(lastOptions).includes('email'));
});

test('the admin-only staff list still includes email', async () => {
  await listAllStaff({}, res());

  assert.ok(userAttributes(lastOptions).includes('email'));
});

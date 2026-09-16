const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidDateString,
  isValidTimeString,
  validateServiceInput,
  validateHoursObject,
  validateSpecialDates,
} = require('../utils/validation');

test('date and time validation accepts valid values', () => {
  assert.equal(isValidDateString('2026-09-22'), true);
  assert.equal(isValidTimeString('09:30'), true);
  assert.equal(isValidTimeString('25:00'), false);
  assert.equal(isValidDateString('2026-02-31'), false);
});

test('service validation rejects invalid duration and price', () => {
  assert.match(validateServiceInput({ name: 'Cut', durationMinutes: 0, price: 100 }), /Duration/);
  assert.match(validateServiceInput({ name: 'Cut', durationMinutes: 30, price: -1 }), /Price/);
  assert.equal(validateServiceInput({ name: 'Cut', durationMinutes: 30, price: 100 }), null);
});

test('working hours and special dates are validated', () => {
  assert.match(validateHoursObject({ mon: [{ start: '18:00', end: '09:00' }] }), /start time/);
  assert.match(validateSpecialDates([{ date: '2026-12-25', type: 'unknown' }]), /type/);
  assert.equal(validateSpecialDates([{ date: '2026-12-25', type: 'closed' }]), null);
});

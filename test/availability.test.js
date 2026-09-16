const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAvailableSlots,
  isSlotWithinOpenHours,
  resolveSalonHoursForDate,
} = require('../utils/availability');

test('available slots intersect salon and staff hours and remove conflicts', () => {
  const slots = getAvailableSlots({
    salonHours: [{ start: '09:00', end: '12:00' }],
    staffHours: [{ start: '10:00', end: '13:00' }],
    durationMinutes: 60,
    existingBookings: [{ startTime: '11:00', endTime: '12:00' }],
    stepMinutes: 30,
  });

  assert.deepEqual(slots, [
    { startTime: '10:00', endTime: '11:00' },
  ]);
});

test('special closed dates override weekly hours', () => {
  const hours = resolveSalonHoursForDate({
    workingHours: { mon: [{ start: '09:00', end: '18:00' }] },
    specialDates: [{ date: '2026-09-21', type: 'closed' }],
    date: '2026-09-21',
    dayKey: 'mon',
  });
  assert.deepEqual(hours, []);
});

test('slot must fit entirely inside open hours', () => {
  assert.equal(isSlotWithinOpenHours({
    salonHours: [{ start: '09:00', end: '17:00' }],
    staffHours: [{ start: '10:00', end: '16:00' }],
    startTime: '15:00',
    endTime: '16:00',
  }), true);
  assert.equal(isSlotWithinOpenHours({
    salonHours: [{ start: '09:00', end: '17:00' }],
    staffHours: [{ start: '10:00', end: '16:00' }],
    startTime: '16:00',
    endTime: '17:00',
  }), false);
});

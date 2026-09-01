// Pure helper functions for turning "salon hours + staff hours + service
// duration + existing bookings" into a list of bookable time slots.
// Kept dependency-free (no DB calls here) so it's easy to test in isolation.

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function dayKeyFromDate(dateStr) {
  // dateStr: 'YYYY-MM-DD'. Appending T00:00:00 (no Z) parses it in local
  // time instead of UTC, which avoids the classic "date shifts by one day"
  // bug you get from `new Date('2026-08-29')` in some timezones.
  const d = new Date(`${dateStr}T00:00:00`);
  return DAY_KEYS[d.getDay()];
}

/**
 * Resolves the salon's effective open ranges for one specific calendar date,
 * applying any matching entry from SalonSettings.specialDates on top of the
 * normal weekly workingHours.
 *   - type 'closed'                  -> salon is shut all day: []
 *   - type 'special' / 'early_close' -> that date's hours are replaced
 *     entirely by the entry's { start, end } (e.g. an early-closing time,
 *     or a one-off special schedule)
 *   - no matching entry              -> falls back to the normal weekly
 *     workingHours[dayKey]
 *
 * @param {Object} params
 * @param {Object} params.workingHours - salon's normal weekly hours, e.g. { mon: [...], ... }
 * @param {Array}  params.specialDates - [{ date: 'YYYY-MM-DD', type, start?, end? }]
 * @param {string} params.date         - 'YYYY-MM-DD' being checked
 * @param {string} params.dayKey       - result of dayKeyFromDate(date)
 * @returns {Array} [{start,end}] in 'HH:MM'
 */
function resolveSalonHoursForDate({ workingHours, specialDates = [], date, dayKey }) {
  const override = (specialDates || []).find((sd) => sd.date === date);
  if (override) {
    if (override.type === 'closed') return [];
    if (override.start && override.end) return [{ start: override.start, end: override.end }];
  }
  return (workingHours && workingHours[dayKey]) || [];
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Intersects two lists of {start, end} ranges (each in 'HH:MM'), returns the
// overlapping portions as minute-based ranges: [{start, end}] (minutes).
function intersectRanges(rangesA = [], rangesB = []) {
  const a = rangesA.map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }));
  const b = rangesB.map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }));

  const result = [];
  for (const rangeA of a) {
    for (const rangeB of b) {
      const start = Math.max(rangeA.start, rangeB.start);
      const end = Math.min(rangeA.end, rangeB.end);
      if (start < end) result.push({ start, end });
    }
  }
  return result;
}

// Given open ranges (minutes) + a service duration, generate candidate slot
// start times every `stepMinutes` (default 15), each `durationMinutes` long,
// that fit entirely inside one of the ranges.
function generateCandidateSlots(ranges, durationMinutes, stepMinutes = 15) {
  const slots = [];
  for (const range of ranges) {
    for (let start = range.start; start + durationMinutes <= range.end; start += stepMinutes) {
      slots.push({ start, end: start + durationMinutes });
    }
  }
  return slots;
}

// Removes candidate slots that overlap any existing booking.
// existingBookings: [{ startTime: 'HH:MM', endTime: 'HH:MM' }]
function removeConflicts(candidateSlots, existingBookings) {
  const booked = existingBookings.map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
  }));

  return candidateSlots.filter((slot) =>
    !booked.some((b) => slot.start < b.end && slot.end > b.start) // overlap test
  );
}

/**
 * Checks whether a specific [startTime, endTime) slot falls entirely inside
 * hours that are open in BOTH salonHours and staffHours. Reuses
 * intersectRanges so the "must be open in both" rule is defined in exactly
 * one place, shared with getAvailableSlots.
 */
function isSlotWithinOpenHours({ salonHours, staffHours, startTime, endTime }) {
  const openRanges = intersectRanges(salonHours, staffHours);
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  return openRanges.some((r) => startMin >= r.start && endMin <= r.end);
}

/**
 * Main entry point.
 * @param {Object} params
 * @param {Array}  params.salonHours   - salon's ranges for that day: [{start,end}]
 * @param {Array}  params.staffHours   - staff's ranges for that day: [{start,end}]
 * @param {number} params.durationMinutes - service duration
 * @param {Array}  params.existingBookings - [{startTime, endTime}] already booked for that staff/date
 * @param {number} [params.stepMinutes] - slot granularity, default 15
 * @returns {Array} [{ startTime: 'HH:MM', endTime: 'HH:MM' }]
 */
function getAvailableSlots({ salonHours, staffHours, durationMinutes, existingBookings, stepMinutes = 15 }) {
  const openRanges = intersectRanges(salonHours, staffHours); // salon AND staff must both be open
  const candidates = generateCandidateSlots(openRanges, durationMinutes, stepMinutes);
  const free = removeConflicts(candidates, existingBookings);
  return free.map((s) => ({ startTime: minutesToTime(s.start), endTime: minutesToTime(s.end) }));
}

module.exports = {
  dayKeyFromDate,
  timeToMinutes,
  minutesToTime,
  intersectRanges,
  generateCandidateSlots,
  removeConflicts,
  isSlotWithinOpenHours,
  getAvailableSlots,
  resolveSalonHoursForDate,
};
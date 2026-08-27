// Combines a 'YYYY-MM-DD' date and 'HH:MM' time into a real Date object,
// then returns how many hours from now until that moment (negative if past).
function hoursUntil(dateStr, timeStr) {
  const target = new Date(`${dateStr}T${timeStr}:00`);
  const diffMs = target.getTime() - Date.now();
  return diffMs / (1000 * 60 * 60);
}

module.exports = { hoursUntil };

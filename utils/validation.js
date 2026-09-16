const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function cleanString(value, maxLength = 255) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00`);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

function isValidTimeString(value) {
  return typeof value === 'string' && TIME_RE.test(value);
}

function isFutureDateTime(date, time) {
  if (!isValidDateString(date) || !isValidTimeString(time)) return false;
  return new Date(`${date}T${time}:00`).getTime() > Date.now();
}

function validateHoursObject(workingHours, { allowEmpty = true } = {}) {
  if (!workingHours || typeof workingHours !== 'object' || Array.isArray(workingHours)) {
    return 'workingHours must be an object';
  }

  for (const key of DAY_KEYS) {
    const ranges = workingHours[key];
    if (ranges === undefined) continue;
    if (!Array.isArray(ranges)) return `${key}: working hours must be an array`;
    if (!allowEmpty && ranges.length === 0) return `${key}: at least one working period is required`;

    for (const range of ranges) {
      if (!range || !isValidTimeString(range.start) || !isValidTimeString(range.end)) {
        return `${key}: working hours must use HH:MM times`;
      }
      if (range.start >= range.end) {
        return `${key}: start time must be before end time`;
      }
    }
  }

  return null;
}

function validateSpecialDates(specialDates) {
  if (specialDates === undefined) return null;
  if (!Array.isArray(specialDates)) return 'specialDates must be an array';

  const seen = new Set();
  for (const entry of specialDates) {
    if (!entry || !isValidDateString(entry.date)) return 'Each special day must contain a valid YYYY-MM-DD date';
    if (seen.has(entry.date)) return `Duplicate special day: ${entry.date}`;
    seen.add(entry.date);

    if (!['closed', 'special', 'early_close'].includes(entry.type)) {
      return `${entry.date}: type must be closed, special, or early_close`;
    }

    if (entry.type !== 'closed') {
      if (!isValidTimeString(entry.start) || !isValidTimeString(entry.end)) {
        return `${entry.date}: start and end times are required`;
      }
      if (entry.start >= entry.end) return `${entry.date}: start time must be before end time`;
    }
  }

  return null;
}

function validateServiceInput({ name, description, durationMinutes, price }, { partial = false } = {}) {
  if (!partial || name !== undefined) {
    const cleanName = cleanString(name, 120);
    if (!cleanName) return 'Service name is required';
    if (cleanName.length > 120) return 'Service name must be 120 characters or fewer';
  }

  if (description !== undefined && String(description).length > 2000) {
    return 'Service description must be 2000 characters or fewer';
  }

  if (!partial || durationMinutes !== undefined) {
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 720) {
      return 'Duration must be a whole number between 5 and 720 minutes';
    }
  }

  if (!partial || price !== undefined) {
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      return 'Price must be a valid amount between ₹0 and ₹1,000,000';
    }
  }

  return null;
}

function validatePersonInput({ name, email, password }, { passwordRequired = false } = {}) {
  const cleanName = cleanString(name, 120);
  if (!cleanName) return 'Name is required';
  if (cleanName.length < 2) return 'Name must be at least 2 characters';
  if (!isValidEmail(email)) return 'Please provide a valid email address';
  if (passwordRequired && (typeof password !== 'string' || password.length < 6)) {
    return 'Password must be at least 6 characters';
  }
  return null;
}

module.exports = {
  cleanString,
  isValidEmail,
  isValidDateString,
  isValidTimeString,
  isFutureDateTime,
  validateHoursObject,
  validateSpecialDates,
  validateServiceInput,
  validatePersonInput,
};

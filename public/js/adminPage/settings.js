
const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

const SPECIAL_TYPE_LABELS = {
  closed: 'Holiday / Closed',
  special: 'Special working hours',
  early_close: 'Early closing',
};

let currentWorkingHours = {};
let currentSpecialDates = [];

// LOAD SETTINGS

async function loadSettings() {
  try {
    const settings = await api('/salon-settings', { auth: false });

    currentWorkingHours = settings.workingHours || {};
    currentSpecialDates = settings.specialDates || [];

    renderWeeklyHoursForm();
    renderSpecialDaysList();
  } catch (err) {
    console.error('Failed to load salon settings:', err);

    currentWorkingHours = {};
    currentSpecialDates = [];

    document.getElementById('weeklyHoursRows').innerHTML =
      '<p class="error">Could not load working hours.</p>';

    document.getElementById('specialDaysList').innerHTML =
      '<p class="error">Could not load special days.</p>';
  }
}

// WEEKLY WORKING HOURS

function renderWeeklyHoursForm() {
  const container = document.getElementById('weeklyHoursRows');

  container.innerHTML = DAYS.map(([key, label]) => {
    const ranges = currentWorkingHours[key] || [];
    const isOpen = ranges.length > 0;

    const start = isOpen ? ranges[0].start : '09:00';
    const end = isOpen ? ranges[0].end : '18:00';

    return `
      <div class="wh-row">
        <span class="wh-day">${label}</span>

        <label class="wh-open-toggle">
          <input
            type="checkbox"
            id="wh-open-${key}"
            ${isOpen ? 'checked' : ''}
            onchange="toggleDayInputs('${key}')"
          />
          Open
        </label>

        <input
          type="time"
          id="wh-start-${key}"
          value="${start}"
          ${isOpen ? '' : 'disabled'}
        />

        <span>to</span>

        <input
          type="time"
          id="wh-end-${key}"
          value="${end}"
          ${isOpen ? '' : 'disabled'}
        />
      </div>
    `;
  }).join('');
}

function toggleDayInputs(day) {
  const openCheckbox = document.getElementById(`wh-open-${day}`);
  const startInput = document.getElementById(`wh-start-${day}`);
  const endInput = document.getElementById(`wh-end-${day}`);

  const isOpen = openCheckbox.checked;

  startInput.disabled = !isOpen;
  endInput.disabled = !isOpen;
}

function collectWeeklyHours() {
  const workingHours = {};

  for (const [key] of DAYS) {
    const isOpen = document.getElementById(`wh-open-${key}`).checked;

    // Closed day
    if (!isOpen) {
      workingHours[key] = [];
      continue;
    }

    const start = document.getElementById(`wh-start-${key}`).value;
    const end = document.getElementById(`wh-end-${key}`).value;

    if (!start || !end) {
      throw new Error(
        `${key.toUpperCase()}: start and end time are required.`
      );
    }

    if (start >= end) {
      throw new Error(
        `${key.toUpperCase()}: start time must be before end time.`
      );
    }

    workingHours[key] = [{ start, end }];
  }

  return workingHours;
}

async function saveWeeklyHours() {
  const msg = document.getElementById('settingsMsg');

  msg.innerHTML = '';

  let workingHours;

  try {
    workingHours = collectWeeklyHours();
  } catch (err) {
    msg.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }

  try {
    await api('/salon-settings', {
      method: 'PUT',
      body: {
        workingHours,
        specialDates: currentSpecialDates,
      },
    });

    currentWorkingHours = workingHours;

    msg.innerHTML =
      '<p class="success">Working hours saved successfully.</p>';
  } catch (err) {
    msg.innerHTML =
      `<p class="error">Could not save working hours: ${escapeHtml(err.message)}</p>`;
  }
}

// SPECIAL DAYS

function toggleSpecialHoursInputs() {
  const type = document.getElementById('sdType').value;
  const fields = document.getElementById('sdHoursFields');

  fields.style.display = type === 'closed' ? 'none' : 'flex';
}

function formatTime(time) {
  if (!time) return '';

  const [hours, minutes] = time.split(':').map(Number);

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${String(displayHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function renderSpecialDaysList() {
  const list = document.getElementById('specialDaysList');

  if (currentSpecialDates.length === 0) {
    list.innerHTML =
      '<p class="empty-state">No special days configured.</p>';
    return;
  }

  const sortedDates = [...currentSpecialDates].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  list.innerHTML = sortedDates.map(day => {
    const index = currentSpecialDates.indexOf(day);
    const label = SPECIAL_TYPE_LABELS[day.type] || day.type;

    let hours = '';

    if (day.type !== 'closed' && day.start && day.end) {
      hours = `
        <span class="special-day-hours">
          ${formatTime(day.start)} → ${formatTime(day.end)}
        </span>
      `;
    }

    return `
      <div class="special-day-row">

        <div class="special-day-info">
          <div class="special-day-date">
            ${escapeHtml(day.date)}
          </div>

          <div class="special-day-type">
            ${escapeHtml(label)}
            ${hours}
          </div>
        </div>

        <button
          class="danger"
          style="margin-top:0"
          onclick="removeSpecialDay(${index})"
        >
          Remove
        </button>

      </div>
    `;
  }).join('');
}

// ADD / UPDATE SPECIAL DAY

async function addSpecialDay() {
  const msg = document.getElementById('specialDaysMsg');

  msg.innerHTML = '';

  const date = document.getElementById('sdDate').value;
  const type = document.getElementById('sdType').value;

  if (!date) {
    msg.innerHTML =
      '<p class="error">Please select a date.</p>';
    return;
  }

  const entry = {
    date,
    type,
  };

  // Closed days do not need working hours.
  if (type !== 'closed') {
    const start = document.getElementById('sdStart').value;
    const end = document.getElementById('sdEnd').value;

    if (!start || !end) {
      msg.innerHTML =
        '<p class="error">Please provide both start and end time.</p>';
      return;
    }

    if (start >= end) {
      msg.innerHTML =
        '<p class="error">Start time must be before end time.</p>';
      return;
    }

    entry.start = start;
    entry.end = end;
  }

  // Replace an existing setting for the same date.
  const existingIndex = currentSpecialDates.findIndex(
    day => day.date === date
  );

  const updatedDates = [...currentSpecialDates];

  if (existingIndex >= 0) {
    updatedDates[existingIndex] = entry;
  } else {
    updatedDates.push(entry);
  }

  try {
    await api('/salon-settings', {
      method: 'PUT',
      body: {
        workingHours: currentWorkingHours,
        specialDates: updatedDates,
      },
    });

    currentSpecialDates = updatedDates;

    renderSpecialDaysList();

    msg.innerHTML =
      '<p class="success">Special day saved successfully.</p>';

    clearSpecialDayForm();
  } catch (err) {
    msg.innerHTML =
      `<p class="error">Could not save special day: ${escapeHtml(err.message)}</p>`;
  }
}
// REMOVE SPECIAL DAY

async function removeSpecialDay(index) {
  const day = currentSpecialDates[index];

  if (!day) return;

  const confirmed = confirm(
    `Remove the special-day setting for ${day.date}?`
  );

  if (!confirmed) return;

  const msg = document.getElementById('specialDaysMsg');

  const updatedDates = currentSpecialDates.filter(
    (_, i) => i !== index
  );

  try {
    await api('/salon-settings', {
      method: 'PUT',
      body: {
        workingHours: currentWorkingHours,
        specialDates: updatedDates,
      },
    });

    currentSpecialDates = updatedDates;

    renderSpecialDaysList();

    msg.innerHTML =
      '<p class="success">Special day removed successfully.</p>';
  } catch (err) {
    msg.innerHTML =
      `<p class="error">Could not remove special day: ${escapeHtml(err.message)}</p>`;
  }
}
// FORM RESET

function clearSpecialDayForm() {
  document.getElementById('sdDate').value = '';
  document.getElementById('sdStart').value = '';
  document.getElementById('sdEnd').value = '';

  document.getElementById('sdType').value = 'closed';

  toggleSpecialHoursInputs();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
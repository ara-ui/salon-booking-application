// Admin dashboard logic (admin.html).

const user = requireRole('admin');
if (user) document.getElementById('welcome').textContent = `Hi, ${user.name}`;

function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.getElementById(`tab-${name}`).style.display = '';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// =============================================================================
// USERS — activate / deactivate
// =============================================================================

async function loadUsers() {
  const msg = document.getElementById('userMsg');
  msg.innerHTML = '';
  let users;
  try {
    users = await api('/users');
  } catch (err) {
    msg.innerHTML = `<p class="error">Could not load users: ${err.message}</p>`;
    return;
  }

  document.getElementById('userRows').innerHTML = users.map(u => {
    const isSelf = u.id === user.id;
    const action = isSelf
      ? '<span style="color:#888;font-size:13px">You</span>'
      : `<button id="userBtn-${u.id}" class="secondary" style="margin-top:0" onclick="toggleActive(${u.id}, ${!u.isActive}, '${u.name.replace(/'/g, "\\'")}')">
           ${u.isActive ? 'Deactivate' : 'Activate'}</button>`;
    return `
      <tr>
        <td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
        <td>${u.isActive ? 'Active' : 'Deactivated'}</td>
        <td>${action}</td>
      </tr>
    `;
  }).join('');
}

async function toggleActive(id, nextIsActive, name) {
  const verb = nextIsActive ? 'activate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${verb} ${name}'s account?`)) return;

  const btn = document.getElementById(`userBtn-${id}`);
  const msg = document.getElementById('userMsg');
  msg.innerHTML = '';
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    await api(`/users/${id}/active`, { method: 'PUT', body: { isActive: nextIsActive } });
    msg.innerHTML = `<p class="success">${name} was ${nextIsActive ? 'activated' : 'deactivated'}.</p>`;
  } catch (err) {
    msg.innerHTML = `<p class="error">Failed to ${verb} ${name}: ${err.message}</p>`;
  } finally {
    // Always reload from the server so the UI can never show a state the
    // backend didn't actually confirm (success OR failure).
    loadUsers();
  }
}

// =============================================================================
// SERVICES — create / edit / delete
// =============================================================================

let _servicesCache = [];

async function loadServices() {
  _servicesCache = await api('/services', { auth: false });
  document.getElementById('serviceRows').innerHTML = _servicesCache.map(s => `
    <tr>
      <td>${s.name}</td><td>${s.durationMinutes} min</td><td>${fmtMoney(s.price)}</td><td>${s.isActive ? 'Yes' : 'No'}</td>
      <td>
        <button class="secondary" style="margin-top:0" onclick="editService(${s.id})">Edit</button>
        <button class="danger" style="margin-top:0" onclick="deleteServiceConfirm(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">No services yet.</td></tr>';
}

document.getElementById('serviceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('serviceMsg');
  try {
    await api('/services', { method: 'POST', body: {
      name: document.getElementById('svcName').value,
      description: document.getElementById('svcDesc').value,
      durationMinutes: Number(document.getElementById('svcDuration').value),
      price: Number(document.getElementById('svcPrice').value),
    }});
    msg.innerHTML = '<p class="success">Service created.</p>';
    e.target.reset();
    loadServices(); loadStaff();
  } catch (err) { msg.innerHTML = `<p class="error">${err.message}</p>`; }
});

function editService(id) {
  const s = _servicesCache.find(sv => sv.id === id);
  if (!s) return;
  document.getElementById('svcEditId').value = s.id;
  document.getElementById('svcEditName').value = s.name;
  document.getElementById('svcEditDesc').value = s.description || '';
  document.getElementById('svcEditDuration').value = s.durationMinutes;
  document.getElementById('svcEditPrice').value = s.price;
  document.getElementById('svcEditActive').checked = s.isActive;
  document.getElementById('serviceEditMsg').innerHTML = '';
  const panel = document.getElementById('serviceEditPanel');
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth' });
}

function closeServiceEdit() {
  document.getElementById('serviceEditPanel').style.display = 'none';
}

async function saveServiceEdit() {
  const id = document.getElementById('svcEditId').value;
  const msg = document.getElementById('serviceEditMsg');
  const saveBtn = document.querySelector('#serviceEditPanel button');
  saveBtn.disabled = true;
  try {
    await api(`/services/${id}`, { method: 'PUT', body: {
      name: document.getElementById('svcEditName').value,
      description: document.getElementById('svcEditDesc').value,
      durationMinutes: Number(document.getElementById('svcEditDuration').value),
      price: Number(document.getElementById('svcEditPrice').value),
      isActive: document.getElementById('svcEditActive').checked,
    }});
    msg.innerHTML = '<p class="success">Saved.</p>';
    await loadServices();
    await loadStaff(); // service names/prices shown there too
    closeServiceEdit();
  } catch (err) {
    // Panel stays open on failure so the admin can see what didn't save and retry.
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteServiceConfirm(id, name) {
  if (!confirm(`Delete "${name}"? This removes it from the customer-facing list.`)) return;
  const msg = document.getElementById('serviceMsg');
  try {
    await api(`/services/${id}`, { method: 'DELETE' });
    msg.innerHTML = `<p class="success">"${name}" was deleted.</p>`;
  } catch (err) {
    msg.innerHTML = `<p class="error">Could not delete "${name}": ${err.message}</p>`;
  } finally {
    // Re-fetch from the server either way — the list only ever shows what
    // the backend actually has, never an optimistic guess.
    await loadServices();
    await loadStaff();
  }
}

// =============================================================================
// STAFF — create / assign a service
// =============================================================================

let _allServices = [];
let _lastAssignedServiceIdByStaff = {}; // staffId -> serviceId, used to reliably show "current" right after an assign

async function loadStaff() {
  _allServices = await api('/services', { auth: false });
  const staff = await api('/staff', { auth: false });
  document.getElementById('staffRows').innerHTML = staff.map(renderStaffRow).join('');
}

function renderStaffRow(s) {
  const assignedIds = (s.Services || []).map(sv => sv.id);
  // Prefer the service we just assigned client-side (reliable, order-independent)
  // over inferring "most recent" from array order, which the DB doesn't guarantee.
  const hinted = _lastAssignedServiceIdByStaff[s.id];
  const currentServiceId = (hinted && assignedIds.includes(hinted))
    ? hinted
    : (assignedIds.length ? assignedIds[assignedIds.length - 1] : '');

  const placeholder = `<option value="" ${currentServiceId ? '' : 'selected'} disabled>Select service</option>`;
  const options = _allServices.map(sv =>
    `<option value="${sv.id}" ${String(sv.id) === String(currentServiceId) ? 'selected' : ''}>${sv.name}</option>`
  ).join('');

  // Starts disabled+muted whenever the selected value is already assigned —
  // which, by construction above, is always true on initial render (either
  // it's the current service, or nothing is selected yet).
  return `
    <tr>
      <td>${s.User.name}</td>
      <td>${s.specialization || ''}</td>
      <td>${(s.Services || []).map(sv => sv.name).join(', ') || '—'}</td>
      <td>
        <select id="assign-${s.id}" data-assigned="${assignedIds.join(',')}" onchange="handleAssignSelectChange(${s.id})">
          ${placeholder}${options}
        </select>
        <button id="assignBtn-${s.id}" class="secondary" style="margin-top:0" disabled onclick="assignService(${s.id})">Assign</button>
      </td>
    </tr>
  `;
}

function handleAssignSelectChange(staffId) {
  const select = document.getElementById(`assign-${staffId}`);
  const btn = document.getElementById(`assignBtn-${staffId}`);
  const assignedIds = (select.dataset.assigned || '').split(',').filter(Boolean);
  const selected = select.value;
  const alreadyAssigned = !selected || assignedIds.includes(selected);

  btn.disabled = alreadyAssigned;
  btn.classList.toggle('secondary', alreadyAssigned);
}

async function assignService(staffId) {
  const select = document.getElementById(`assign-${staffId}`);
  const btn = document.getElementById(`assignBtn-${staffId}`);
  const serviceId = Number(select.value);
  if (!serviceId) return; // guarded by disabled state too, but double-check

  const msg = document.getElementById('staffAssignMsg');
  msg.innerHTML = '';
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Assigning...';

  try {
    await api(`/staff/${staffId}/services`, { method: 'POST', body: { serviceIds: [serviceId] } });
    _lastAssignedServiceIdByStaff[staffId] = serviceId;
    msg.innerHTML = '<p class="success">Assignment saved.</p>';
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  } finally {
    btn.textContent = originalText;
    // Full re-fetch — the row is rebuilt from the server's actual state,
    // so the button correctly re-disables once the new assignment is confirmed.
    await loadStaff();
  }
}

document.getElementById('staffForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('staffMsg');
  try {
    await api('/staff', { method: 'POST', body: {
      name: document.getElementById('stfName').value,
      email: document.getElementById('stfEmail').value,
      password: document.getElementById('stfPassword').value,
      specialization: document.getElementById('stfSpecialization').value,
      workingHours: {
        mon: [{ start: '09:00', end: '18:00' }], tue: [{ start: '09:00', end: '18:00' }],
        wed: [{ start: '09:00', end: '18:00' }], thu: [{ start: '09:00', end: '18:00' }],
        fri: [{ start: '09:00', end: '18:00' }], sat: [{ start: '09:00', end: '18:00' }],
      },
    }});
    msg.innerHTML = '<p class="success">Staff account created.</p>';
    e.target.reset();
    loadStaff(); loadUsers();
  } catch (err) { msg.innerHTML = `<p class="error">${err.message}</p>`; }
});

// =============================================================================
// APPOINTMENTS (unchanged)
// =============================================================================

async function loadAppointments() {
  const appts = await api('/appointments');
  document.getElementById('apptRows').innerHTML = appts.map(a => `
    <tr>
      <td>${a.customer.name}</td><td>${a.Staff.User.name}</td><td>${a.Service.name}</td>
      <td>${a.date} ${a.startTime}</td><td>${badge(a.status)}</td><td>${badge(a.paymentStatus)}</td>
    </tr>
  `).join('');
}
async function triggerReminders() {
  const msg = document.getElementById('reminderMsg');
  try {
    const res = await api('/admin/run-reminders', { method: 'POST' });
    msg.innerHTML = `<p class="success">Sent ${res.remindersSent} reminder(s) for ${res.date}.</p>`;
  } catch (err) { msg.innerHTML = `<p class="error">${err.message}</p>`; }
}

// =============================================================================
// SALON SETTINGS — weekly hours form + special days
// =============================================================================

const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];
const SPECIAL_TYPE_LABELS = { closed: 'Holiday / Closed', special: 'Special working hours', early_close: 'Early closing' };

let _currentWorkingHours = {};
let _currentSpecialDates = [];

async function loadSettings() {
  const msg = document.getElementById('settingsMsg');
  try {
    const settings = await api('/salon-settings', { auth: false });
    _currentWorkingHours = settings.workingHours || {};
    _currentSpecialDates = settings.specialDates || [];
  } catch {
    // Not configured yet — start from an empty week, every day closed.
    _currentWorkingHours = {};
    _currentSpecialDates = [];
  }
  renderWeeklyHoursForm();
  renderSpecialDaysList();
}

function renderWeeklyHoursForm() {
  document.getElementById('weeklyHoursRows').innerHTML = DAYS.map(([key, label]) => {
    const ranges = _currentWorkingHours[key] || [];
    const open = ranges.length > 0;
    const start = open ? ranges[0].start : '09:00';
    const end = open ? ranges[0].end : '18:00';
    return `
      <div class="wh-row">
        <span class="wh-day">${label}</span>
        <label class="wh-open-toggle">
          <input type="checkbox" id="wh-open-${key}" ${open ? 'checked' : ''} onchange="toggleDayInputs('${key}')" /> Open
        </label>
        <input type="time" id="wh-start-${key}" value="${start}" ${open ? '' : 'disabled'} />
        <span>to</span>
        <input type="time" id="wh-end-${key}" value="${end}" ${open ? '' : 'disabled'} />
      </div>
    `;
  }).join('');
}

function toggleDayInputs(key) {
  const open = document.getElementById(`wh-open-${key}`).checked;
  document.getElementById(`wh-start-${key}`).disabled = !open;
  document.getElementById(`wh-end-${key}`).disabled = !open;
}

function collectWeeklyHoursFromForm() {
  const workingHours = {};
  for (const [key] of DAYS) {
    const open = document.getElementById(`wh-open-${key}`).checked;
    if (!open) { workingHours[key] = []; continue; }
    const start = document.getElementById(`wh-start-${key}`).value;
    const end = document.getElementById(`wh-end-${key}`).value;
    if (!start || !end) throw new Error(`${key.toUpperCase()}: both a start and end time are required when marked Open`);
    if (start >= end) throw new Error(`${key.toUpperCase()}: start time must be before end time`);
    workingHours[key] = [{ start, end }];
  }
  return workingHours;
}

async function saveWeeklyHours() {
  const msg = document.getElementById('settingsMsg');
  msg.innerHTML = '';
  let workingHours;
  try {
    workingHours = collectWeeklyHoursFromForm();
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
    return;
  }
  try {
    await api('/salon-settings', { method: 'PUT', body: { workingHours, specialDates: _currentSpecialDates } });
    _currentWorkingHours = workingHours;
    msg.innerHTML = '<p class="success">Working hours saved.</p>';
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function toggleSpecialHoursInputs() {
  const type = document.getElementById('sdType').value;
  document.getElementById('sdHoursFields').style.display = (type === 'closed') ? 'none' : '';
}

function renderSpecialDaysList() {
  const list = document.getElementById('specialDaysList');
  if (_currentSpecialDates.length === 0) {
    list.innerHTML = '<p style="font-size:13px;color:#888">No special days configured.</p>';
    return;
  }
  const sorted = [..._currentSpecialDates].sort((a, b) => a.date.localeCompare(b.date));
  list.innerHTML = sorted.map(sd => {
    const idx = _currentSpecialDates.indexOf(sd);
    const hours = (sd.type !== 'closed' && sd.start && sd.end) ? ` (${sd.start}–${sd.end})` : '';
    return `
      <div class="special-day-row">
        <span><b>${sd.date}</b> — ${SPECIAL_TYPE_LABELS[sd.type] || sd.type}${hours}</span>
        <button class="danger" style="margin-top:0" onclick="removeSpecialDay(${idx})">Remove</button>
      </div>
    `;
  }).join('');
}

async function addSpecialDay() {
  const msg = document.getElementById('specialDaysMsg');
  msg.innerHTML = '';
  const date = document.getElementById('sdDate').value;
  const type = document.getElementById('sdType').value;
  if (!date) { msg.innerHTML = '<p class="error">Pick a date first.</p>'; return; }

  const entry = { date, type };
  if (type !== 'closed') {
    const start = document.getElementById('sdStart').value;
    const end = document.getElementById('sdEnd').value;
    if (!start || !end) { msg.innerHTML = '<p class="error">Both a start and end time are required for this type.</p>'; return; }
    if (start >= end) { msg.innerHTML = '<p class="error">Start time must be before end time.</p>'; return; }
    entry.start = start; entry.end = end;
  }

  // Editing: replace any existing entry for the same date rather than duplicating it.
  const existingIndex = _currentSpecialDates.findIndex(sd => sd.date === date);
  const nextSpecialDates = [..._currentSpecialDates];
  if (existingIndex >= 0) nextSpecialDates[existingIndex] = entry;
  else nextSpecialDates.push(entry);

  try {
    await api('/salon-settings', { method: 'PUT', body: { workingHours: _currentWorkingHours, specialDates: nextSpecialDates } });
    _currentSpecialDates = nextSpecialDates;
    renderSpecialDaysList();
    msg.innerHTML = '<p class="success">Special day saved.</p>';
    document.getElementById('sdDate').value = '';
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function removeSpecialDay(index) {
  const entry = _currentSpecialDates[index];
  if (!entry) return;
  if (!confirm(`Remove the special-day setting for ${entry.date}?`)) return;

  const msg = document.getElementById('specialDaysMsg');
  const nextSpecialDates = _currentSpecialDates.filter((_, i) => i !== index);
  try {
    await api('/salon-settings', { method: 'PUT', body: { workingHours: _currentWorkingHours, specialDates: nextSpecialDates } });
    _currentSpecialDates = nextSpecialDates;
    renderSpecialDaysList();
    msg.innerHTML = '<p class="success">Removed.</p>';
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

if (user) { loadUsers(); loadServices(); loadStaff(); loadAppointments(); loadSettings(); }

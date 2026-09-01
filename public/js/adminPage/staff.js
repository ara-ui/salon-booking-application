// STAFF — create / assign services

let _allServices = [];
let _lastAssignedServiceIdByStaff = {};

async function loadStaff() {
  try {
    _allServices = await api('/services', {
      auth: false
    });

    const staff = await api('/staff', {
      auth: false
    });

    document.getElementById('staffRows').innerHTML =
      staff.map(renderStaffRow).join('');

  } catch (err) {

    document.getElementById('staffRows').innerHTML = `
      <tr>
        <td colspan="4" class="error">
          Could not load staff: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}


function renderStaffRow(s) {

  const assignedIds =
    (s.Services || []).map(service => service.id);

  const hinted =
    _lastAssignedServiceIdByStaff[s.id];

  const currentServiceId =
    hinted && assignedIds.includes(hinted)
      ? hinted
      : (
          assignedIds.length
            ? assignedIds[assignedIds.length - 1]
            : ''
        );

  const placeholder = `
    <option
      value=""
      ${currentServiceId ? '' : 'selected'}
      disabled
    >
      Select service
    </option>
  `;

  const options = _allServices.map(service => `
    <option
      value="${service.id}"
      ${
        String(service.id) === String(currentServiceId)
          ? 'selected'
          : ''
      }
    >
      ${escapeHtml(service.name)}
    </option>
  `).join('');

  return `
    <tr>

      <td>${escapeHtml(s.User.name)}</td>

      <td>${escapeHtml(s.specialization || '')}</td>

      <td>
        ${
          (s.Services || [])
            .map(service => escapeHtml(service.name))
            .join(', ') || '—'
        }
      </td>

      <td>

        <div class="assignment-controls">

          <select
            id="assign-${s.id}"
            data-assigned="${assignedIds.join(',')}"
            onchange="handleAssignSelectChange(${s.id})"
          >
            ${placeholder}
            ${options}
          </select>

          <button
            id="assignBtn-${s.id}"
            class="assign-btn secondary"
            style="margin-top:0"
            disabled
            onclick="assignService(${s.id})"
          >
            Assign
          </button>

        </div>

      </td>

    </tr>
  `;
}


function handleAssignSelectChange(staffId) {

  const select = document.getElementById(
    `assign-${staffId}`
  );

  const btn = document.getElementById(
    `assignBtn-${staffId}`
  );

  const assignedIds =
    (select.dataset.assigned || '')
      .split(',')
      .filter(Boolean);

  const selected = select.value;

  const alreadyAssigned =
    !selected ||
    assignedIds.includes(selected);

  btn.disabled = alreadyAssigned;

  btn.classList.toggle(
    'assign-ready',
    !alreadyAssigned
  );

  btn.classList.toggle(
    'secondary',
    alreadyAssigned
  );
}


async function assignService(staffId) {

  const select = document.getElementById(
    `assign-${staffId}`
  );

  const btn = document.getElementById(
    `assignBtn-${staffId}`
  );

  const serviceId = Number(select.value);

  if (!serviceId) return;

  const msg = document.getElementById(
    'staffAssignMsg'
  );

  msg.innerHTML = '';

  btn.disabled = true;

  const originalText = btn.textContent;

  btn.textContent = 'Assigning...';

  try {

    await api(`/staff/${staffId}/services`, {
      method: 'POST',
      body: {
        serviceIds: [serviceId]
      }
    });

    _lastAssignedServiceIdByStaff[staffId] =
      serviceId;

    msg.innerHTML = `
      <p class="success">
        Assignment saved.
      </p>
    `;

  } catch (err) {

    msg.innerHTML = `
      <p class="error">
        ${escapeHtml(err.message)}
      </p>
    `;

  } finally {

    btn.textContent = originalText;

    await loadStaff();
  }
}


// CREATE STAFF

document
  .getElementById('staffForm')
  .addEventListener('submit', async (e) => {

    e.preventDefault();

    const msg =
      document.getElementById('staffMsg');

    const button =
      e.target.querySelector(
        'button[type="submit"]'
      );

    msg.innerHTML = '';

    button.disabled = true;
    button.textContent = 'Creating...';

    try {

      await api('/staff', {
        method: 'POST',
        body: {

          name:
            document
              .getElementById('stfName')
              .value
              .trim(),

          email:
            document
              .getElementById('stfEmail')
              .value
              .trim(),

          password:
            document
              .getElementById('stfPassword')
              .value,

          specialization:
            document
              .getElementById('stfSpecialization')
              .value
              .trim(),

          workingHours: {

            mon: [
              { start: '09:00', end: '18:00' }
            ],

            tue: [
              { start: '09:00', end: '18:00' }
            ],

            wed: [
              { start: '09:00', end: '18:00' }
            ],

            thu: [
              { start: '09:00', end: '18:00' }
            ],

            fri: [
              { start: '09:00', end: '18:00' }
            ],

            sat: [
              { start: '09:00', end: '18:00' }
            ]

          }

        }
      });

      msg.innerHTML = `
        <p class="success">
          Staff account created successfully.
        </p>
      `;

      e.target.reset();

      await loadStaff();
      await loadUsers();

    } catch (err) {

      msg.innerHTML = `
        <p class="error">
          ${escapeHtml(err.message)}
        </p>
      `;

    } finally {

      button.disabled = false;
      button.textContent = 'Create staff';

    }
  });


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
// Customer dashboard logic (customer.html).

const user = requireRole('customer');
if (user) document.getElementById('welcome').textContent = `Hi, ${user.name}`;

let selectedServiceId = null;
let selectedSlot = null;
let rescheduleApptId = null; // set when the booking panel is being used to reschedule instead of book new

async function loadServices() {
  const services = await api('/services', { auth: false });
  const staff = await api('/staff', { auth: false });

  document.getElementById('services').innerHTML = services.map(s => `
    <div class="card" style="margin-bottom:0">
      <h2 style="font-size:15px">${s.name}</h2>
      <p style="font-size:13px;color:#666">${s.description || ''}</p>
      <p style="font-size:13px">${s.durationMinutes} min &middot; ${fmtMoney(s.price)}</p>
      <button onclick="openBooking(${s.id}, '${s.name.replace(/'/g,"\\'")}')">Book</button>
    </div>
  `).join('');

  window._staffCache = staff;
}

// The customer never picks staff — this only opens the booking panel (date +
// available-times step). Staff is resolved automatically by the backend at
// booking time. If nobody is assigned to this service at all, we tell the
// customer clearly and never open the panel — same message the backend
// itself would return if this check were somehow bypassed.
function openBooking(serviceId, serviceName) {
  const servicesMsg = document.getElementById('servicesMsg');
  const eligibleStaff = (window._staffCache || []).filter(st => (st.Services || []).some(sv => sv.id === serviceId));

  if (eligibleStaff.length === 0) {
    servicesMsg.innerHTML = '<p class="error">No staff is currently assigned to this service. Please choose another service or contact the salon.</p>';
    return;
  }
  servicesMsg.innerHTML = '';

  selectedServiceId = serviceId;
  rescheduleApptId = null;
  document.getElementById('bookingServiceName').textContent = serviceName;
  document.getElementById('slots').innerHTML = '';
  document.getElementById('bookingMsg').innerHTML = '';
  document.getElementById('bookingPanel').style.display = '';
  document.getElementById('bookingPanel').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('loadSlotsBtn').onclick = async () => {
  const date = document.getElementById('bookingDate').value;
  const msg = document.getElementById('bookingMsg');
  msg.innerHTML = '';
  if (!date) { msg.innerHTML = '<p class="error">Pick a date first.</p>'; return; }

  try {
    // No staffId — the backend returns the union of slots bookable with any
    // assigned staff member for this service.
    const res = await api(`/appointments/available-slots?serviceId=${selectedServiceId}&date=${date}`, { auth: false });
    const slotsDiv = document.getElementById('slots');
    if (res.slots.length === 0) {
      slotsDiv.innerHTML = '<p>No free slots that day — try another date.</p>';
    } else {
      slotsDiv.innerHTML = res.slots.map(s => `<span class="slot-btn" data-time="${s.startTime}" onclick="pickSlot(this)">${s.startTime}</span>`).join('');
    }
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
};

function pickSlot(el) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedSlot = el.dataset.time;
  confirmBooking();
}

async function confirmBooking() {
  const date = document.getElementById('bookingDate').value;
  const msg = document.getElementById('bookingMsg');
  try {
    if (rescheduleApptId) {
      // Reschedule already keeps the originally-assigned staff member —
      // never asked the customer to pick one, so no change needed here.
      await api(`/appointments/${rescheduleApptId}/reschedule`, { method: 'PUT', body: { date, startTime: selectedSlot } });
      msg.innerHTML = '<p class="success">Rescheduled!</p>';
    } else {
      // No staffId sent — the backend auto-assigns an available assigned staff member.
      await api('/appointments', { method: 'POST', body: { serviceId: selectedServiceId, date, startTime: selectedSlot } });
      msg.innerHTML = '<p class="success">Booked! Check your email for confirmation.</p>';
    }
    document.getElementById('bookingPanel').style.display = 'none';
    loadAppointments();
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadAppointments() {
  const appts = await api('/appointments/mine');
  document.getElementById('apptRows').innerHTML = appts.map(a => `
    <tr>
      <td>${a.Service.name}</td>
      <td>${a.Staff.User.name}</td>
      <td>${a.date}</td>
      <td>${a.startTime}</td>
      <td>${badge(a.status)}</td>
      <td>${badge(a.paymentStatus)}</td>
      <td><button class="secondary" style="margin-top:0" onclick="viewDetail(${a.id})">View</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">No appointments yet.</td></tr>';
}

async function viewDetail(id) {
  const a = await api(`/appointments/${id}`);
  const panel = document.getElementById('detailPanel');
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth' });

  let actions = '';
  if (a.paymentStatus === 'unpaid' && a.status !== 'cancelled') {
    actions += `<button onclick="payNow(${a.id})">Pay now (Stripe test)</button>`;
  }
  if (a.paymentStatus === 'paid') {
    actions += `<button class="secondary" onclick="downloadInvoice(${a.id})">Download invoice</button>`;
  }
  if (a.status === 'booked' || a.status === 'rescheduled') {
    actions += `<button class="secondary" onclick="startReschedule(${a.id}, ${a.serviceId}, ${a.staffId}, '${a.Service.name.replace(/'/g,"\\'")}')">Reschedule</button>`;
    actions += `<button class="danger" onclick="cancelAppt(${a.id})">Cancel</button>`;
  }
  if (a.status === 'completed') {
    actions += `
      <div style="margin-top:14px">
        <label>Rating (1-5)</label>
        <input type="number" id="reviewRating" min="1" max="5" value="5" />
        <label>Comment</label>
        <textarea id="reviewComment" rows="2"></textarea>
        <button onclick="leaveReview(${a.id})">Submit review</button>
      </div>`;
  }

  panel.innerHTML = `
    <h2>Appointment #${a.id}</h2>
    <p><b>Service:</b> ${a.Service.name}</p>
    <p><b>Staff:</b> ${a.Staff.User.name}</p>
    <p><b>Date:</b> ${a.date} at ${a.startTime}</p>
    <p><b>Status:</b> ${badge(a.status)} &nbsp; <b>Payment:</b> ${badge(a.paymentStatus)}</p>
    <div id="detailMsg"></div>
    ${actions}
  `;
}

async function payNow(id) {
  try {
    const res = await api('/payments/checkout', { method: 'POST', body: { appointmentId: id } });
    window.location.href = res.url; // redirect to Stripe test checkout
  } catch (err) {
    document.getElementById('detailMsg').innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function downloadInvoice(id) {
  // Binary response — fetch directly rather than through the JSON api() helper.
  const res = await fetch(`/api/appointments/${id}/invoice`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) { document.getElementById('detailMsg').innerHTML = '<p class="error">Could not download invoice.</p>'; return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `invoice-${id}.pdf`; a.click();
}

function startReschedule(apptId, serviceId, staffId, serviceName) {
  openBooking(serviceId, serviceName);
  rescheduleApptId = apptId;
}

async function cancelAppt(id) {
  try {
    await api(`/appointments/${id}/cancel`, { method: 'PUT' });
    viewDetail(id);
    loadAppointments();
  } catch (err) {
    document.getElementById('detailMsg').innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function leaveReview(apptId) {
  try {
    await api('/reviews', {
      method: 'POST',
      body: {
        appointmentId: apptId,
        rating: Number(document.getElementById('reviewRating').value),
        comment: document.getElementById('reviewComment').value,
      },
    });
    document.getElementById('detailMsg').innerHTML = '<p class="success">Thanks for the review!</p>';
  } catch (err) {
    document.getElementById('detailMsg').innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// =============================================================================
// PREFERENCES — editable form vs. compact saved summary
// =============================================================================

// "Has saved preferences" = at least one field holds a deliberate, non-default
// value. reminderOptIn defaults to true, so only counts if explicitly turned off.
function preferencesExist(me) {
  return !!me.preferredStaffId || !!(me.preferenceNotes && me.preferenceNotes.trim()) || me.reminderOptIn === false;
}

function showPreferenceForm() {
  document.getElementById('prefSummary').style.display = 'none';
  document.getElementById('prefForm').style.display = '';
}

function renderPreferenceSummary(me, staffName) {
  document.getElementById('prefSummaryStaff').textContent = staffName || 'No preference';
  document.getElementById('prefSummaryReminder').textContent = me.reminderOptIn !== false ? 'Enabled' : 'Disabled';
  document.getElementById('prefSummaryNotes').textContent = (me.preferenceNotes && me.preferenceNotes.trim()) || 'None';
  document.getElementById('prefSummary').style.display = '';
  document.getElementById('prefForm').style.display = 'none';
}

async function loadPreferences() {
  const me = await api('/users/me');
  window._preferredStaffId = me.preferredStaffId || null;

  // Populate the dropdown with staff NAMES — the customer only ever sees
  // names; the option's value (what actually gets sent to the API) is the ID.
  const staffSelect = document.getElementById('prefStaffSelect');
  const allStaff = window._staffCache || await api('/staff', { auth: false });
  staffSelect.innerHTML = '<option value="">No preference</option>' +
    allStaff.map(st => `<option value="${st.id}">${st.User.name}${st.specialization ? ' — ' + st.specialization : ''}</option>`).join('');
  if (me.preferredStaffId) staffSelect.value = me.preferredStaffId;

  document.getElementById('prefReminderOptIn').checked = me.reminderOptIn !== false;
  document.getElementById('prefNotes').value = me.preferenceNotes || '';

  if (preferencesExist(me)) {
    const staffName = me.preferredStaffId ? allStaff.find(st => st.id === me.preferredStaffId)?.User.name : null;
    renderPreferenceSummary(me, staffName);
  } else {
    showPreferenceForm();
  }
}

async function savePreferences() {
  const msg = document.getElementById('prefMsg');
  const staffVal = document.getElementById('prefStaffSelect').value;
  try {
    await api('/users/me', {
      method: 'PUT',
      body: {
        preferredStaffId: staffVal ? Number(staffVal) : null,
        reminderOptIn: document.getElementById('prefReminderOptIn').checked,
        preferenceNotes: document.getElementById('prefNotes').value,
      },
    });
    window._preferredStaffId = staffVal ? Number(staffVal) : null;
    msg.innerHTML = '<p class="success">Preferences saved.</p>';
    await loadPreferences(); // re-fetches true DB state, switches to the summary view
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

if (user) { loadServices().then(loadPreferences); loadAppointments(); }

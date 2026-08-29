// Customer dashboard logic (customer.html).

const user = requireRole('customer');
if (user) document.getElementById('welcome').textContent = `Hi, ${user.name}`;

let selectedServiceId = null;
let selectedStaffId = null;
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

function openBooking(serviceId, serviceName) {
  selectedServiceId = serviceId;
  rescheduleApptId = null;
  document.getElementById('bookingServiceName').textContent = serviceName;
  const eligibleStaff = window._staffCache.filter(st => (st.Services || []).some(sv => sv.id === serviceId));
  const staffSelect = document.getElementById('staffSelect');
  staffSelect.innerHTML = eligibleStaff.map(st => `<option value="${st.id}">${st.User.name}${st.specialization ? ' — ' + st.specialization : ''}</option>`).join('')
    || '<option value="">No staff assigned to this service yet</option>';

  // Pre-select the customer's preferred staff member (by name, under the hood
  // it's just selecting the <option> whose value is their staff ID) if that
  // staff member happens to offer this particular service.
  if (window._preferredStaffId && eligibleStaff.some(st => st.id === window._preferredStaffId)) {
    staffSelect.value = window._preferredStaffId;
  }

  document.getElementById('slots').innerHTML = '';
  document.getElementById('bookingMsg').innerHTML = '';
  document.getElementById('bookingPanel').style.display = '';
  document.getElementById('bookingPanel').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('loadSlotsBtn').onclick = async () => {
  const staffId = document.getElementById('staffSelect').value;
  const date = document.getElementById('bookingDate').value;
  const msg = document.getElementById('bookingMsg');
  msg.innerHTML = '';
  if (!staffId || !date) { msg.innerHTML = '<p class="error">Pick a staff member and date first.</p>'; return; }

  try {
    const res = await api(`/appointments/available-slots?serviceId=${selectedServiceId}&staffId=${staffId}&date=${date}`, { auth: false });
    selectedStaffId = staffId;
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
      await api(`/appointments/${rescheduleApptId}/reschedule`, { method: 'PUT', body: { date, startTime: selectedSlot } });
      msg.innerHTML = '<p class="success">Rescheduled!</p>';
    } else {
      await api('/appointments', { method: 'POST', body: { serviceId: selectedServiceId, staffId: selectedStaffId, date, startTime: selectedSlot } });
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
  document.getElementById('staffSelect').value = staffId;
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
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

if (user) { loadServices().then(loadPreferences); loadAppointments(); }

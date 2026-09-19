const user = requireRole('staff');
const $ = (id) => document.getElementById(id);

if (user) $('welcome').textContent = `Hi, ${user.name}`;

async function loadAppointments() {
  try {
    const appts = await api('/appointments/staff/mine');
    appts.sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`));

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const todayAppts = appts.filter((a) => a.date === todayKey);
    const upcoming = appts.filter((a) => ['booked', 'rescheduled'].includes(a.status));
    const completedToday = todayAppts.filter((a) => a.status === 'completed');

    $('todayCount').textContent = todayAppts.length;
    $('upcomingCount').textContent = upcoming.length;
    $('completedCount').textContent = completedToday.length;

    if (!appts.length) {
      $('apptRows').innerHTML = '<div class="empty-state">No appointments are assigned to you yet.</div>';
      return;
    }

    $('apptRows').innerHTML = appts.map((a) => `
      <article class="staff-appt-card">
        <div class="staff-time">${escapeHtml(formatTime12(a.startTime))}</div>
        <div>
          <div class="staff-customer">${escapeHtml(a.customer?.name || 'Customer')}</div>
          <small class="muted">${escapeHtml(a.Service?.name || 'Service')} · ${escapeHtml(formatDateLong(a.date))}</small>
        </div>
        <div>
          ${badge(a.status)}
          ${a.status === 'booked' || a.status === 'rescheduled' ? `<button type="button" data-complete-id="${a.id}">Enter customer completion code</button>` : ''}
        </div>
      </article>
    `).join('');

    $('apptRows').querySelectorAll('[data-complete-id]').forEach((button) => {
      button.addEventListener('click', () => verifyCompletion(Number(button.dataset.completeId), button));
    });
  } catch (err) {
    $('apptRows').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function verifyCompletion(id, button) {
  const code = window.prompt('Enter the 6-digit completion code shown by the customer:');
  if (code === null) return;

  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) {
    window.alert('Enter the 6-digit completion code.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Verifying…';

  try {
    await api(`/appointments/${id}/verify-completion`, {
      method: 'POST',
      body: { code: clean },
    });
    pushNotification('Appointment completed', `Appointment #${id} is now completed. The customer can proceed to payment.`);
    await loadAppointments();
  } catch (err) {
    window.alert(err.message);
    button.disabled = false;
    button.textContent = 'Enter customer completion code';
  }
}

async function loadReviews() {
  try {
    const staffList = await api('/staff', { auth: false });
    const mine = staffList.find((s) => s.User && Number(s.User.id) === Number(user.id));
    if (!mine) { $('reviews').innerHTML = '<div class="empty-state">No staff profile found.</div>'; return; }

    const reviews = await api(`/reviews?staffId=${mine.id}`, { auth: false });
    if (!reviews.length) { $('reviews').innerHTML = '<div class="empty-state">No reviews yet. Guest feedback will appear here.</div>'; return; }

    $('reviews').innerHTML = reviews.map((r) => `
      <article class="review-card">
        <div class="review-stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
        <p><strong>${escapeHtml(r.customer?.name || 'Guest')}</strong></p>
        <p>${escapeHtml(r.comment || 'No written comment.')}</p>
        ${r.staffResponse ? `<div class="review-response"><strong>Your response:</strong> ${escapeHtml(r.staffResponse)}</div>` : `
          <label for="resp-${r.id}">Your response</label>
          <textarea id="resp-${r.id}" rows="3" maxlength="1000" placeholder="Thank the guest or respond to their feedback…"></textarea>
          <button type="button" data-respond-id="${r.id}">Respond</button>
        `}
      </article>
    `).join('');

    $('reviews').querySelectorAll('[data-respond-id]').forEach((button) => {
      button.addEventListener('click', () => respond(Number(button.dataset.respondId), button));
    });
  } catch (err) {
    $('reviews').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function respond(reviewId, button) {
  const text = $(`resp-${reviewId}`).value.trim();
  if (!text) return;
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    await api(`/reviews/${reviewId}/response`, { method: 'PUT', body: { response: text } });
    await loadReviews();
  } catch (err) {
    window.alert(err.message);
    button.disabled = false;
    button.textContent = 'Respond';
  }
}

startAutoRefresh(loadAppointments, 4000);

$('logoutBtn')?.addEventListener('click', logout);
if (user) { loadAppointments(); loadReviews(); }

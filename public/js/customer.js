const user = requireRole('customer');

let selectedServiceId = null;
let selectedService = null;
let selectedSlot = null;
let rescheduleApptId = null;
let rescheduleStaffId = null;
let staffCache = [];

const $ = (id) => document.getElementById(id);

function setMessage(id, message, type = '') {
  const el = $(id);
  if (!el) return;
  el.innerHTML = message ? `<p class="${type}">${escapeHtml(message)}</p>` : '';
}

function todayString() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatStatus(status) {
  return status === 'booked' ? 'Confirmed' : status.charAt(0).toUpperCase() + status.slice(1);
}

function appointmentHasEndedClient(a) {
  if (!a?.date || !a?.endTime) return false;
  const end = new Date(`${a.date}T${a.endTime}:00`);
  return Number.isFinite(end.getTime()) && end.getTime() <= Date.now();
}

function appointmentCard(a, upcoming = false) {
  const canModify = (a.status === 'booked' || a.status === 'rescheduled') && a.paymentStatus !== 'paid';
  const canPay = a.status === 'completed' && a.paymentStatus !== 'paid';

  return `
    <article class="appointment-card ${upcoming ? 'appointment-card--upcoming' : ''}">
      <div class="appointment-card__top">
        <div>
          <h3 class="appointment-card__service">${escapeHtml(a.Service?.name || 'Appointment')}</h3>
          <div class="appointment-card__when">${escapeHtml(formatDateLong(a.date))} · ${escapeHtml(formatTime12(a.startTime))}</div>
        </div>
        ${badge(a.status)}
      </div>
      <div class="appointment-card__meta">
        <div class="appointment-meta-item"><small>Staff</small><strong>${escapeHtml(a.Staff?.User?.name || 'Assigned staff')}</strong></div>
        <div class="appointment-meta-item"><small>Duration</small><strong>${Number(a.Service?.durationMinutes || 0)} min</strong></div>
        <div class="appointment-meta-item"><small>Payment</small><strong>${badge(a.paymentStatus)}</strong></div>
      </div>
      <div class="appointment-card__actions">
        <button type="button" class="table-action-btn" data-view-id="${a.id}">View appointment</button>
        ${canPay ? `<button type="button" class="outline" data-pay-id="${a.id}">Pay now</button>` : ''}
        ${appointmentHasEndedClient(a) && (a.status === 'booked' || a.status === 'rescheduled') && a.paymentStatus !== 'paid' ? `<button type="button" class="secondary" data-generate-code-id="${a.id}">Generate completion code</button>` : ''}
        ${canModify ? `<button type="button" class="secondary" data-reschedule-id="${a.id}">Reschedule</button>` : ''}
        ${canModify ? `<button type="button" class="danger" data-cancel-id="${a.id}">Cancel</button>` : ''}
      </div>
    </article>
  `;
}

async function loadServices() {
  const [services, staff] = await Promise.all([
    api('/services', { auth: false }),
    api('/staff', { auth: false }),
  ]);

  staffCache = staff;
  $('servicesCount').textContent = `${services.length} service${services.length === 1 ? '' : 's'}`;

  if (!services.length) {
    $('services').innerHTML = '<p class="empty-state">No services are available right now. Please check back soon.</p>';
    return;
  }

  $('services').innerHTML = services.map((s) => `
    <article class="card service-card">
      <h3 class="service-card__name">${escapeHtml(s.name)}</h3>
      <p class="service-card__desc">${escapeHtml(s.description || 'A relaxing salon service tailored to you.')}</p>
      <p class="service-card__meta">${Number(s.durationMinutes)} min · ${fmtMoney(s.price)}</p>
      <button class="service-card__book" type="button" data-book-service="${s.id}">Book now →</button>
    </article>
  `).join('');

  $('services').querySelectorAll('[data-book-service]').forEach((button) => {
    button.addEventListener('click', () => {
      const service = services.find((item) => Number(item.id) === Number(button.dataset.bookService));
      if (service) bookNewService(service);
    });
  });
}

function bookNewService(service) {
  rescheduleApptId = null;
  rescheduleStaffId = null;
  openBooking(service);
}

function openBooking(service, mode = 'new') {
  const eligibleStaff = staffCache.filter((st) => (st.Services || []).some((sv) => Number(sv.id) === Number(service.id)));
  if (!eligibleStaff.length) {
    setMessage('servicesMsg', 'No staff is currently assigned to this service. Please choose another service or contact the salon.', 'error');
    return;
  }

  selectedService = service;
  selectedServiceId = service.id;
  selectedSlot = null;
  $('bookingHeading').textContent = mode === 'reschedule' ? 'Choose a new time' : 'Book your appointment';
  $('bookingServiceName').textContent = service.name;
  $('bookingServiceMeta').textContent = `${service.durationMinutes} minutes · ${fmtMoney(service.price)}`;
  $('bookingDate').min = todayString();
  $('bookingDate').value = '';
  $('slots').innerHTML = '<p class="empty-state">Choose a date to see available times.</p>';
  $('bookingSummary').textContent = 'Choose a date and time to see your appointment summary.';
  $('bookingMsg').innerHTML = '';
  $('confirmBookingBtn').disabled = true;
  $('confirmBookingBtn').textContent = mode === 'reschedule' ? 'Confirm new time' : 'Confirm appointment';
  $('bookingPanel').style.display = '';
  $('bookingPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBooking() {
  $('bookingPanel').style.display = 'none';
  selectedSlot = null;
  rescheduleApptId = null;
  rescheduleStaffId = null;
}

async function loadSlots() {
  const date = $('bookingDate').value;
  selectedSlot = null;
  $('confirmBookingBtn').disabled = true;
  $('bookingSummary').textContent = 'Choose a date and time to see your appointment summary.';

  if (!date) {
    setMessage('bookingMsg', 'Please choose a date first.', 'error');
    return;
  }

  setMessage('bookingMsg', 'Finding available times…', 'notice');
  $('slots').innerHTML = '<p class="empty-state">Checking availability…</p>';

  try {
    const params = new URLSearchParams({ serviceId: selectedServiceId, date });
    if (rescheduleApptId) params.set('staffId', rescheduleStaffId);
    if (rescheduleApptId) params.set('excludeAppointmentId', rescheduleApptId);

    const res = await api(`/appointments/available-slots?${params.toString()}`, { auth: false });
    setMessage('bookingMsg', '', '');

    if (!res.slots.length) {
      $('slots').innerHTML = '<p class="empty-state">No free times are available on this date. Try another day.</p>';
      return;
    }

    $('slots').innerHTML = res.slots.map((slot) => `
      <button type="button" class="slot-btn" data-time="${escapeHtml(slot.startTime)}" aria-label="${escapeHtml(formatTime12(slot.startTime))}">${escapeHtml(formatTime12(slot.startTime))}</button>
    `).join('');

    $('slots').querySelectorAll('.slot-btn').forEach((button) => {
      button.addEventListener('click', () => pickSlot(button, res.slots.find((slot) => slot.startTime === button.dataset.time)));
    });
  } catch (err) {
    $('slots').innerHTML = '';
    setMessage('bookingMsg', err.message, 'error');
  }
}

function pickSlot(button, slot) {
  $('slots').querySelectorAll('.slot-btn').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  selectedSlot = slot.startTime;
  $('confirmBookingBtn').disabled = false;
  $('bookingSummary').innerHTML = `
    <strong>${escapeHtml(selectedService.name)}</strong>
    <span>${escapeHtml(formatDateLong($('bookingDate').value))} · ${escapeHtml(formatTime12(selectedSlot))} · ${Number(selectedService.durationMinutes)} minutes · ${fmtMoney(selectedService.price)}</span>
  `;
}

async function confirmBooking() {
  const date = $('bookingDate').value;
  if (!date || !selectedSlot) return;

  const button = $('confirmBookingBtn');
  button.disabled = true;
  button.textContent = rescheduleApptId ? 'Updating…' : 'Booking…';
  setMessage('bookingMsg', '', '');

  try {
    if (rescheduleApptId) {
      const appointmentId = rescheduleApptId;
      await api(`/appointments/${appointmentId}/reschedule`, {
        method: 'PUT',
        body: { date, startTime: selectedSlot },
      });
      closeBooking();
      await loadAppointments();
      await showDetail(appointmentId, false);
      setMessage('detailMsg', 'Your appointment has been rescheduled.', 'success');
    } else {
      const created = await api('/appointments', {
        method: 'POST',
        body: { serviceId: selectedServiceId, date, startTime: selectedSlot },
      });
      closeBooking();
      await loadAppointments();
      await showDetail(created.id, false);
      setMessage('detailMsg', 'Your appointment has been booked successfully. A confirmation email has been sent.', 'success');
    }
  } catch (err) {
    setMessage('bookingMsg', err.message, 'error');
    button.disabled = false;
    button.textContent = rescheduleApptId ? 'Confirm new time' : 'Confirm appointment';
  }
}

async function loadAppointments() {
  try {
    const appts = await api('/appointments/mine');
    appts.sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`));

    if (!appts.length) {
      $('apptRows').innerHTML = '<div class="empty-state">You don’t have any appointments yet. Choose a service above to get started.</div>';
      return;
    }

    $('apptRows').innerHTML = appts.map((a) => appointmentCard(a)).join('');
    bindAppointmentActions();
  } catch (err) {
    $('apptRows').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}


function bindAppointmentActions() {
  $('apptRows').querySelectorAll('[data-view-id]').forEach((b) => b.addEventListener('click', () => showDetail(Number(b.dataset.viewId))));
  $('apptRows').querySelectorAll('[data-pay-id]').forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.dataset.payId);
    b.disabled = true;
    b.textContent = 'Preparing…';
    try {
      await showDetail(id);
      await payNow(id);
    } finally {
      // The appointment list may be re-rendered after payment, so only
      // restore this button if it is still part of the document.
      if (b.isConnected) {
        b.disabled = false;
        b.textContent = 'Pay now';
      }
    }
  }));
  $('apptRows').querySelectorAll('[data-generate-code-id]').forEach((b) => b.addEventListener('click', () => generateCompletionCode(Number(b.dataset.generateCodeId), b)));
  $('apptRows').querySelectorAll('[data-reschedule-id]').forEach((b) => b.addEventListener('click', () => startReschedule(Number(b.dataset.rescheduleId))));
  $('apptRows').querySelectorAll('[data-cancel-id]').forEach((b) => b.addEventListener('click', () => cancelAppt(Number(b.dataset.cancelId))));
}

async function showDetail(id, scroll = true) {
  try {
    const a = await api(`/appointments/${id}`);
    const panel = $('detailPanel');
    const isPaid = a.paymentStatus === 'paid';
    const canModify = (a.status === 'booked' || a.status === 'rescheduled') && !isPaid;
    const canPay = a.status === 'completed' && !isPaid;
    const canGenerateCode = !isPaid && appointmentHasEndedClient(a) && ['booked', 'rescheduled'].includes(a.status);

    panel.innerHTML = `
      <div class="section-heading">
        <div><p class="page-eyebrow">Appointment details</p><h2>Appointment #${a.id}</h2></div>
        ${badge(a.status)}
      </div>
      <div class="detail-grid">
        <div class="detail-item"><small>Service</small><strong>${escapeHtml(a.Service?.name || '—')}</strong></div>
        <div class="detail-item"><small>Staff</small><strong>${escapeHtml(a.Staff?.User?.name || '—')}</strong></div>
        <div class="detail-item"><small>Date</small><strong>${escapeHtml(formatDateLong(a.date))}</strong></div>
        <div class="detail-item"><small>Time</small><strong>${escapeHtml(formatTime12(a.startTime))}</strong></div>
        <div class="detail-item"><small>Price</small><strong>${fmtMoney(a.Service?.price || 0)}</strong></div>
        <div class="detail-item"><small>Payment</small><strong>${badge(a.paymentStatus)}</strong></div>
      </div>
      <div id="detailMsg"></div>
      <div class="appt-actions">
        ${canGenerateCode ? `<button type="button" class="secondary" data-detail-generate="${a.id}">Generate completion code</button>` : ''}
        ${canPay ? `<button type="button" data-detail-pay="${a.id}">Pay securely</button>` : ''}
        ${isPaid ? `<button type="button" class="btn-success" data-invoice-id="${a.id}">Download invoice</button>` : ''}
        ${canModify ? `<button type="button" class="secondary" data-detail-reschedule="${a.id}">Reschedule</button>` : ''}
        ${canModify ? `<button type="button" class="danger" data-detail-cancel="${a.id}">Cancel</button>` : ''}
      </div>
      ${isPaid && canModify === false && a.status !== 'cancelled' ? '<p class="form-help">Paid appointments cannot be cancelled or rescheduled online. Please contact the salon if you need assistance.</p>' : ''}
      ${a.status === 'completed' ? renderReviewSection(a) : ''}
      <div class="appt-back-row"><button type="button" class="outline" id="closeDetailBtn">Close details</button></div>
    `;
    panel.style.display = '';

    panel.querySelector('[data-detail-generate]')?.addEventListener('click', () => generateCompletionCode(id));
    panel.querySelector('[data-detail-pay]')?.addEventListener('click', () => payNow(id));
    panel.querySelector('[data-invoice-id]')?.addEventListener('click', () => downloadInvoice(id));
    panel.querySelector('[data-detail-reschedule]')?.addEventListener('click', () => startReschedule(id));
    panel.querySelector('[data-detail-cancel]')?.addEventListener('click', () => cancelAppt(id));
    panel.querySelector('#closeDetailBtn')?.addEventListener('click', () => { panel.style.display = 'none'; });
    panel.querySelectorAll('[data-rating]').forEach((b) => b.addEventListener('click', () => selectRating(Number(b.dataset.rating))));
    panel.querySelector('#reviewSubmitBtn')?.addEventListener('click', () => leaveReview(id));

    if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    $('detailPanel').style.display = '';
    $('detailPanel').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

function renderReviewSection(a) {
  if (a.Review) {
    const response = a.Review.staffResponse
      ? `<div class="notice"><strong>Salon response:</strong> ${escapeHtml(a.Review.staffResponse)}</div>`
      : '';
    return `<div class="review-box"><h3>Your review</h3><p class="review-stars">${'★'.repeat(a.Review.rating)}${'☆'.repeat(5 - a.Review.rating)}</p><p>${escapeHtml(a.Review.comment || '')}</p>${response}</div>`;
  }

  if (a.paymentStatus !== 'paid') {
    return '<div class="review-box"><h3>Feedback</h3><p class="form-help">Payment is required before you can leave feedback for this visit.</p></div>';
  }

  return `
    <div class="review-box">
      <h3>How was your experience?</h3>
      <div class="rating-picker" role="radiogroup" aria-label="Rating">
        ${[1,2,3,4,5].map((n) => `<button type="button" class="rating-star" data-rating="${n}" aria-label="${n} out of 5">☆</button>`).join('')}
      </div>
      <textarea id="reviewComment" rows="3" maxlength="1000" placeholder="Tell us about your visit…"></textarea>
      <button type="button" id="reviewSubmitBtn">Submit review</button>
    </div>
  `;
}

let selectedRating = 5;
function selectRating(rating) {
  selectedRating = rating;
  $('detailPanel').querySelectorAll('[data-rating]').forEach((b) => {
    b.classList.toggle('selected', Number(b.dataset.rating) <= rating);
    b.textContent = Number(b.dataset.rating) <= rating ? '★' : '☆';
  });
}

async function generateCompletionCode(id, button = null) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Generating…';
  }

  try {
    const result = await api(`/appointments/${id}/completion-code`, {
      method: 'POST',
    });

    const message = `Your completion code for ${result.serviceName} is ${result.code}. Show this code to the assigned staff member to complete the appointment.`;
    pushNotification('Completion code generated', message, `completion-code-${id}`);
    window.alert(`Completion code: ${result.code}\n\nShow this code to the assigned staff member.`);

    await loadAppointments();
    await showDetail(id, false);
  } catch (err) {
    setMessage('detailMsg', err.message, 'error');
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = 'Generate completion code';
    }
  }
}

async function payNow(id) {
  try {
    // The Pay now button on the appointment card lives outside the detail panel.
    // Open the detail panel first so there is a visible message area for payment
    // progress/errors. This also prevents a missing #detailMsg from making the
    // button appear to do nothing.
    if (!$('detailMsg')) {
      await showDetail(id);
    }

    const msg = $('detailMsg');
    if (!msg) {
      throw new Error('Could not open the appointment details. Please try again.');
    }

    msg.innerHTML = '<p class="notice">Preparing secure payment…</p>'; 

    if (typeof window.Cashfree !== 'function') {
      throw new Error('Cashfree checkout could not be loaded. Refresh the page and try again.');
    }

    const order = await api('/payments/checkout', {
      method: 'POST',
      body: { appointmentId: id },
    });

    if (!order?.orderId || !order?.paymentSessionId) {
      throw new Error('Cashfree did not return a valid payment session. Please try again.');
    }

    const cashfree = window.Cashfree({ mode: 'sandbox' });
    const result = await cashfree.checkout({
      paymentSessionId: order.paymentSessionId,
      redirectTarget: '_modal',
    });

    if (result?.error) {
      setMessage(
        'detailMsg',
        result.error.message || 'Payment was not completed. Your appointment is still safe.',
        'error'
      );
      return;
    }

    // Cashfree checkout returning control to the page does not itself prove
    // that money was received. The backend independently verifies the order.
    const verified = await api('/payments/verify', {
      method: 'POST',
      body: { orderId: order.orderId },
    });

    if (verified.appointmentPaymentStatus === 'paid') {
      setMessage('detailMsg', 'Payment successful — your appointment is confirmed.', 'success');
    } else {
      setMessage(
        'detailMsg',
        'Payment could not be verified. Please contact the salon if you were charged.',
        'error'
      );
    }

    await Promise.all([showDetail(id, false), loadAppointments(), loadPaymentHistory()]);
  } catch (err) {
    setMessage('detailMsg', err.message || 'Payment could not be started. Please try again.', 'error');
  }
}

async function loadPaymentHistory() {
  try {
    const payments = await api('/payments/mine');
    if (!payments.length) {
      $('paymentHistoryRows').innerHTML = '<div class="empty-state">No successful payments yet.</div>';
      return;
    }
    $('paymentHistoryRows').innerHTML = payments.map((p) => `
      <article class="payment-card">
        <div><div class="payment-card__title">${escapeHtml(p.Appointment?.Service?.name || 'Appointment')}</div><div class="payment-card__meta">Appointment #${p.Appointment?.id || '—'} · ${escapeHtml(new Date(p.createdAt).toLocaleDateString('en-IN'))}</div></div>
        <div><div class="payment-card__amount">${fmtMoney(p.amount)}</div>${badge(p.status)}</div>
      </article>
    `).join('');
  } catch (err) {
    $('paymentHistoryRows').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function downloadInvoice(id) {
  try {
    const res = await fetch(`/api/appointments/${id}/invoice`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('Could not download the invoice.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    setMessage('detailMsg', err.message, 'error');
  }
}

async function startReschedule(id) {
  try {
    const a = await api(`/appointments/${id}`);
    if (a.paymentStatus === 'paid') {
      setMessage('detailMsg', 'Paid appointments cannot be rescheduled online. Please contact the salon.', 'error');
      return;
    }
    const service = { id: a.serviceId, name: a.Service.name, durationMinutes: a.Service.durationMinutes, price: a.Service.price };
    rescheduleApptId = id;
    rescheduleStaffId = a.staffId;
    openBooking(service, 'reschedule');
  } catch (err) {
    setMessage('detailMsg', err.message, 'error');
  }
}

async function cancelAppt(id) {
  if (!window.confirm('Cancel this appointment? This action cannot be undone.')) return;
  try {
    await api(`/appointments/${id}/cancel`, { method: 'PUT' });
    await Promise.all([loadAppointments(), loadPaymentHistory()]);
    await showDetail(id, false);
    setMessage('detailMsg', 'Your appointment has been cancelled.', 'success');
  } catch (err) {
    setMessage('detailMsg', err.message, 'error');
  }
}

async function leaveReview(apptId) {
  const comment = $('reviewComment')?.value?.trim() || '';
  try {
    await api('/reviews', { method: 'POST', body: { appointmentId: apptId, rating: selectedRating, comment } });
    await showDetail(apptId, false);
    setMessage('detailMsg', 'Thank you for sharing your experience!', 'success');
  } catch (err) {
    setMessage('detailMsg', err.message, 'error');
  }
}

function preferencesExist(me) {
  return !!me.preferredStaffId || !!(me.preferenceNotes && me.preferenceNotes.trim()) || me.reminderOptIn === false;
}

function showPreferenceForm() {
  $('prefSummary').style.display = 'none';
  $('prefForm').style.display = '';
}

function renderPreferenceSummary(me, staffName) {
  $('prefSummaryStaff').textContent = staffName || 'No preference';
  $('prefSummaryReminder').textContent = me.reminderOptIn !== false ? 'Enabled' : 'Disabled';
  $('prefSummaryNotes').textContent = (me.preferenceNotes && me.preferenceNotes.trim()) || 'None';
  $('prefSummary').style.display = '';
  $('prefForm').style.display = 'none';
}

async function loadPreferences() {
  const me = await api('/users/me');
  const staffSelect = $('prefStaffSelect');
  staffSelect.innerHTML = '<option value="">No preference</option>' + staffCache.map((st) => `<option value="${st.id}">${escapeHtml(st.User.name)}${st.specialization ? ` — ${escapeHtml(st.specialization)}` : ''}</option>`).join('');
  if (me.preferredStaffId) staffSelect.value = me.preferredStaffId;
  $('prefReminderOptIn').checked = me.reminderOptIn !== false;
  $('prefNotes').value = me.preferenceNotes || '';

  if (preferencesExist(me)) {
    const staffName = me.preferredStaffId ? staffCache.find((st) => Number(st.id) === Number(me.preferredStaffId))?.User.name : null;
    renderPreferenceSummary(me, staffName);
  } else showPreferenceForm();
}

async function savePreferences() {
  const button = $('savePreferencesBtn');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await api('/users/me', {
      method: 'PUT',
      body: {
        preferredStaffId: $('prefStaffSelect').value ? Number($('prefStaffSelect').value) : null,
        reminderOptIn: $('prefReminderOptIn').checked,
        preferenceNotes: $('prefNotes').value.trim(),
      },
    });
    setMessage('prefMsg', 'Preferences saved successfully.', 'success');
    await loadPreferences();
  } catch (err) {
    setMessage('prefMsg', err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Save preferences';
  }
}

startAutoRefresh(loadAppointments, 5000);

$('logoutBtn')?.addEventListener('click', logout);
$('heroBookBtn')?.addEventListener('click', () => $('servicesSection').scrollIntoView({ behavior: 'smooth' }));
$('closeBookingBtn')?.addEventListener('click', closeBooking);
$('loadSlotsBtn')?.addEventListener('click', loadSlots);
$('confirmBookingBtn')?.addEventListener('click', confirmBooking);
$('bookingDate')?.addEventListener('change', () => { if ($('bookingDate').value) loadSlots(); });
$('editPreferencesBtn')?.addEventListener('click', showPreferenceForm);
$('savePreferencesBtn')?.addEventListener('click', savePreferences);

if (user) {
  $('welcome').textContent = `Hi, ${user.name}`;
  $('heroGreeting').textContent = `Welcome back, ${user.name.split(' ')[0]} 👋`;
  Promise.all([loadServices(), loadAppointments(), loadPaymentHistory()]).then(loadPreferences).catch((err) => setMessage('servicesMsg', err.message, 'error'));
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted && user) {
    loadAppointments();
    loadPaymentHistory();
  }
});

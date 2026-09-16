const user = requireRole('admin');

if (user) {
  document.getElementById('welcome').textContent = `Hi, ${user.name}`;
}

function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach((tab) => { tab.style.display = 'none'; });
  const selectedTab = document.getElementById(`tab-${name}`);
  if (selectedTab) selectedTab.style.display = '';

  document.querySelectorAll('.admin-sidebar button').forEach((button) => button.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function loadDashboard() {
  try {
    const [appointments, payments] = await Promise.all([
      api('/appointments'),
      api('/payments'),
    ]);

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const todayAppointments = appointments.filter((a) => a.date === todayKey);
    const upcoming = appointments.filter((a) => ['booked', 'rescheduled'].includes(a.status) && new Date(`${a.date}T${a.startTime}:00`).getTime() >= Date.now());
    const completed = appointments.filter((a) => a.status === 'completed');
    const revenue = payments.filter((p) => p.status === 'succeeded').reduce((sum, p) => sum + Number(p.amount), 0);

    document.getElementById('dashToday').textContent = todayAppointments.length;
    document.getElementById('dashUpcoming').textContent = upcoming.length;
    document.getElementById('dashCompleted').textContent = completed.length;
    document.getElementById('dashRevenue').textContent = fmtMoney(revenue);

    const list = todayAppointments.sort((a,b) => a.startTime.localeCompare(b.startTime));
    document.getElementById('dashboardAppointments').innerHTML = list.length ? `
      <div class="staff-schedule">
        ${list.map((a) => `
          <article class="staff-appt-card">
            <div class="staff-time">${escapeHtml(formatTime12(a.startTime))}</div>
            <div><div class="staff-customer">${escapeHtml(a.customer?.name || 'Customer')}</div><small class="muted">${escapeHtml(a.Service?.name || 'Service')} · ${escapeHtml(a.Staff?.User?.name || 'Staff')}</small></div>
            <div>${badge(a.status)}</div>
          </article>
        `).join('')}
      </div>` : '<div class="empty-state">No appointments are scheduled for today.</div>';
  } catch (err) {
    document.getElementById('dashboardAppointments').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAdminReviews() {
  try {
    const reviews = await api('/reviews', { auth: false });
    document.getElementById('adminReviews').innerHTML = reviews.length ? reviews.map((r) => `
      <article class="review-admin-card">
        <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
        <p><strong>${escapeHtml(r.customer?.name || 'Guest')}</strong></p>
        <p>${escapeHtml(r.comment || 'No written comment.')}</p>
        ${r.staffResponse ? `<div class="notice"><strong>Staff response:</strong> ${escapeHtml(r.staffResponse)}</div>` : '<span class="muted">No staff response yet.</span>'}
      </article>
    `).join('') : '<div class="empty-state">No reviews yet.</div>';
  } catch (err) {
    document.getElementById('adminReviews').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

startAutoRefresh(loadDashboard, 7000);

document.getElementById('logoutBtn')?.addEventListener('click', logout);

if (user) {
  loadDashboard();
  loadAdminReviews();
  loadUsers();
  loadAdmins();
  loadServices();
  loadStaff();
  loadAppointments();
  loadSettings();
  loadPayments();
}

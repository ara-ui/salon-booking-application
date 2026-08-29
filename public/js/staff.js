// Staff dashboard logic (staff.html).

const user = requireRole('staff');
if (user) document.getElementById('welcome').textContent = `Hi, ${user.name}`;

async function loadAppointments() {
  const appts = await api('/appointments/staff/mine');
  document.getElementById('apptRows').innerHTML = appts.map(a => `
    <tr>
      <td>${a.customer.name}<br><span style="font-size:12px;color:#888">${a.customer.phone || a.customer.email}</span></td>
      <td>${a.Service.name}</td>
      <td>${a.date}</td>
      <td>${a.startTime}</td>
      <td>${badge(a.status)}</td>
      <td>${a.status === 'booked' || a.status === 'rescheduled'
        ? `<button style="margin-top:0" onclick="markComplete(${a.id})">Mark completed</button>`
        : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">No appointments assigned yet.</td></tr>';
}

async function markComplete(id) {
  await api(`/appointments/${id}/status`, { method: 'PUT', body: { status: 'completed' } });
  loadAppointments();
}

async function loadReviews() {
  // staffId comes from the JWT payload's staffId, exposed via /users/me is not
  // guaranteed to include it, so we fetch the staff list and match by userId.
  const staffList = await api('/staff', { auth: false });
  const mine = staffList.find(s => s.User && s.User.id === user.id);
  if (!mine) { document.getElementById('reviews').innerHTML = '<p>No staff profile found.</p>'; return; }

  const reviews = await api(`/reviews?staffId=${mine.id}`, { auth: false });
  document.getElementById('reviews').innerHTML = reviews.map(r => `
    <div class="card" style="margin-bottom:8px">
      <p>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} — <b>${r.customer.name}</b></p>
      <p>${r.comment || ''}</p>
      ${r.staffResponse
        ? `<p style="color:#3a8a4a"><b>Your response:</b> ${r.staffResponse}</p>`
        : `<textarea id="resp-${r.id}" rows="2" placeholder="Write a response..."></textarea>
           <button style="margin-top:6px" onclick="respond(${r.id})">Respond</button>`}
    </div>
  `).join('') || '<p>No reviews yet.</p>';
}

async function respond(reviewId) {
  const text = document.getElementById(`resp-${reviewId}`).value;
  if (!text) return;
  await api(`/reviews/${reviewId}/response`, { method: 'PUT', body: { response: text } });
  loadReviews();
}

if (user) { loadAppointments(); loadReviews(); }

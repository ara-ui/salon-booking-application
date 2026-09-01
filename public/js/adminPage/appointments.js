// APPOINTMENTS

async function loadAppointments() {
  const rows = document.getElementById('apptRows');

  try {
    const appts = await api('/appointments');

    rows.innerHTML = appts.map(a => `
      <tr>
        <td>${escapeHtml(a.customer.name)}</td>
        <td>${escapeHtml(a.Staff.User.name)}</td>
        <td>${escapeHtml(a.Service.name)}</td>
        <td>${a.date} ${a.startTime}</td>
        <td>${badge(a.status)}</td>
        <td>${badge(a.paymentStatus)}</td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="6">No appointments found.</td>
      </tr>
    `;

  } catch (err) {
    rows.innerHTML = `
      <tr>
        <td colspan="6" class="error">
          Could not load appointments: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}


async function triggerReminders() {
  const msg = document.getElementById('reminderMsg');

  try {
    const res = await api('/admin/run-reminders', {
      method: 'POST'
    });

    msg.innerHTML =
      `<p class="success">Sent ${res.remindersSent} reminder(s) for ${res.date}.</p>`;

  } catch (err) {
    msg.innerHTML =
      `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}
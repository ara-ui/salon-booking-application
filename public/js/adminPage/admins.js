// ADMINS — create / activate / deactivate

async function loadAdmins() {
  const msg = document.getElementById('adminListMsg');
  const rows = document.getElementById('adminRows');

  try {
    const admins = await api('/users?role=admin');

    rows.innerHTML = admins.map(admin => {
      const isSelf = Number(admin.id) === Number(user.id);

      return `
        <tr>
          <td>${escapeHtml(admin.name)}</td>
          <td>${escapeHtml(admin.email)}</td>
          <td>
            <span class="${admin.isActive ? 'status-active' : 'status-inactive'}">
              ${admin.isActive ? 'Active' : 'Deactivated'}
            </span>
          </td>
          <td>
            ${
              isSelf
                ? '<span class="current-user-label">You</span>'
                : `
                  <button
                    class="${admin.isActive ? 'deactivate-btn' : 'activate-btn'}"
                    style="margin-top:0"
                    onclick="toggleAdminActive(${admin.id}, ${!admin.isActive}, '${escapeHtml(admin.name)}')"
                  >
                    ${admin.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                `
            }
          </td>
        </tr>
      `;
    }).join('') || `
      <tr>
        <td colspan="4">No administrators found.</td>
      </tr>
    `;

    msg.innerHTML = '';

  } catch (err) {
    msg.innerHTML =
      `<p class="error">Could not load administrators: ${escapeHtml(err.message)}</p>`;
  }
}


async function toggleAdminActive(id, nextIsActive, name) {
  const verb = nextIsActive ? 'activate' : 'deactivate';

  if (!confirm(`Are you sure you want to ${verb} ${name}'s account?`)) {
    return;
  }

  const msg = document.getElementById('adminListMsg');

  try {
    await api(`/users/${id}/active`, {
      method: 'PUT',
      body: { isActive: nextIsActive }
    });

    msg.innerHTML =
      `<p class="success">${escapeHtml(name)} was ${verb}d.</p>`;

    await loadAdmins();
    await loadUsers();

  } catch (err) {
    msg.innerHTML =
      `<p class="error">Failed to ${verb} ${escapeHtml(name)}: ${escapeHtml(err.message)}</p>`;
  }
}


// CREATE ADMIN

document.getElementById('adminForm').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.target;
  const msg = document.getElementById('adminMsg');
  const button = form.querySelector('button[type="submit"]');

  button.disabled = true;
  button.textContent = 'Creating...';

  try {
    await api('/users/admin', {
      method: 'POST',
      body: {
        name: document.getElementById('adminName').value.trim(),
        email: document.getElementById('adminEmail').value.trim(),
        password: document.getElementById('adminPassword').value
      }
    });

    msg.innerHTML =
      '<p class="success">Admin account created successfully.</p>';

    form.reset();

    await loadAdmins();
    await loadUsers();

  } catch (err) {
    msg.innerHTML =
      `<p class="error">${escapeHtml(err.message)}</p>`;

  } finally {
    button.disabled = false;
    button.textContent = 'Create Admin';
  }
});
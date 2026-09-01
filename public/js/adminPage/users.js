// USERS — activate / deactivate customers and staff

async function loadUsers() {
  const msg = document.getElementById('userMsg');

  try {
    const users = await api('/users');

    const nonAdmins = users.filter(u => u.role !== 'admin');

    document.getElementById('userRows').innerHTML =
      nonAdmins.map(u => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>
            <span class="role-label role-${u.role}">
              ${escapeHtml(u.role)}
            </span>
          </td>
          <td>
            <span class="${u.isActive ? 'status-active' : 'status-inactive'}">
              ${u.isActive ? 'Active' : 'Deactivated'}
            </span>
          </td>
          <td>
            <button
              id="userBtn-${u.id}"
              class="${u.isActive ? 'deactivate-btn' : 'activate-btn'}"
              style="margin-top:0"
              onclick="toggleUserActive(${u.id}, ${!u.isActive}, '${escapeHtml(u.name)}')"
            >
              ${u.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `).join('') || `
        <tr>
          <td colspan="5">No users found.</td>
        </tr>
      `;

    msg.innerHTML = '';

  } catch (err) {
    msg.innerHTML =
      `<p class="error">Could not load users: ${escapeHtml(err.message)}</p>`;
  }
}


async function toggleUserActive(id, nextIsActive, name) {
  const verb = nextIsActive ? 'activate' : 'deactivate';

  if (!confirm(`Are you sure you want to ${verb} ${name}'s account?`)) {
    return;
  }

  const btn = document.getElementById(`userBtn-${id}`);
  const msg = document.getElementById('userMsg');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating...';
  }

  try {
    await api(`/users/${id}/active`, {
      method: 'PUT',
      body: { isActive: nextIsActive }
    });

    msg.innerHTML =
      `<p class="success">${escapeHtml(name)} was ${verb}d.</p>`;

    await loadUsers();

  } catch (err) {
    msg.innerHTML =
      `<p class="error">Failed to ${verb} ${escapeHtml(name)}: ${escapeHtml(err.message)}</p>`;

  } finally {
    if (btn) btn.disabled = false;
  }
}
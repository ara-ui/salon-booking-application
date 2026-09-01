// SERVICES — create / edit / delete

let _servicesCache = [];

async function loadServices() {
  try {
    _servicesCache = await api('/services', { auth: false });

    document.getElementById('serviceRows').innerHTML =
      _servicesCache.map(s => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${s.durationMinutes} min</td>
          <td>${fmtMoney(s.price)}</td>
          <td>${s.isActive ? 'Yes' : 'No'}</td>
          <td>
            <button
              class="secondary"
              style="margin-top:0"
              onclick="editService(${s.id})"
            >
              Edit
            </button>

            <button
              class="danger"
              style="margin-top:0"
              onclick="deleteServiceConfirm(${s.id}, '${escapeHtml(s.name)}')"
            >
              Delete
            </button>
          </td>
        </tr>
      `).join('') || `
        <tr>
          <td colspan="5">No services yet.</td>
        </tr>
      `;

  } catch (err) {
    document.getElementById('serviceRows').innerHTML = `
      <tr>
        <td colspan="5" class="error">
          Could not load services: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}


document.getElementById('serviceForm').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.target;
  const msg = document.getElementById('serviceMsg');

  try {
    await api('/services', {
      method: 'POST',
      body: {
        name: document.getElementById('svcName').value.trim(),
        description: document.getElementById('svcDesc').value.trim(),
        durationMinutes: Number(document.getElementById('svcDuration').value),
        price: Number(document.getElementById('svcPrice').value)
      }
    });

    msg.innerHTML = '<p class="success">Service created.</p>';
    form.reset();

    await loadServices();
    await loadStaff();

  } catch (err) {
    msg.innerHTML =
      `<p class="error">${escapeHtml(err.message)}</p>`;
  }
});


function editService(id) {
  const service = _servicesCache.find(s => s.id === id);
  if (!service) return;

  document.getElementById('svcEditId').value = service.id;
  document.getElementById('svcEditName').value = service.name;
  document.getElementById('svcEditDesc').value = service.description || '';
  document.getElementById('svcEditDuration').value = service.durationMinutes;
  document.getElementById('svcEditPrice').value = service.price;
  document.getElementById('svcEditActive').checked = service.isActive;

  document.getElementById('serviceEditMsg').innerHTML = '';

  const panel = document.getElementById('serviceEditPanel');
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth' });
}


function closeServiceEdit() {
  document.getElementById('serviceEditPanel').style.display = 'none';
}


async function saveServiceEdit() {
  const id = document.getElementById('svcEditId').value;
  const msg = document.getElementById('serviceEditMsg');
  const saveBtn = document.querySelector('#serviceEditPanel button');

  saveBtn.disabled = true;

  try {
    await api(`/services/${id}`, {
      method: 'PUT',
      body: {
        name: document.getElementById('svcEditName').value.trim(),
        description: document.getElementById('svcEditDesc').value.trim(),
        durationMinutes: Number(document.getElementById('svcEditDuration').value),
        price: Number(document.getElementById('svcEditPrice').value),
        isActive: document.getElementById('svcEditActive').checked
      }
    });

    await loadServices();
    await loadStaff();
    closeServiceEdit();

  } catch (err) {
    msg.innerHTML =
      `<p class="error">${escapeHtml(err.message)}</p>`;
  } finally {
    saveBtn.disabled = false;
  }
}


async function deleteServiceConfirm(id, name) {
  if (!confirm(`Delete "${name}"? This removes it from the customer-facing list.`)) {
    return;
  }

  const msg = document.getElementById('serviceMsg');

  try {
    await api(`/services/${id}`, { method: 'DELETE' });

    msg.innerHTML =
      `<p class="success">"${escapeHtml(name)}" was deleted.</p>`;

  } catch (err) {
    msg.innerHTML =
      `<p class="error">Could not delete "${escapeHtml(name)}": ${escapeHtml(err.message)}</p>`;
  }

  await loadServices();
  await loadStaff();
}
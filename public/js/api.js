const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function requireRole(...allowedRoles) {
  const user = getUser();

  if (!user || !getToken()) {
    window.location.href = '/html/index.html';
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    window.location.href = `/html/${user.role}.html`;
    return null;
  }

  return user;
}


/* =========================================================
   GLOBAL API LOADER
   ========================================================= */

let activeApiRequests = 0;
let apiLoaderTimer = null;

function ensureApiLoader() {
  if (document.getElementById('globalApiLoader')) {
    return document.getElementById('globalApiLoader');
  }

  const loader = document.createElement('div');

  loader.id = 'globalApiLoader';
  loader.setAttribute('aria-live', 'polite');
  loader.setAttribute('aria-label', 'Loading');

  loader.innerHTML = '<span></span>';

  loader.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'height:3px',
    'z-index:99999',
    'background:linear-gradient(90deg,transparent,#111,transparent)',
    'background-size:200% 100%',
    'animation:glamupApiLoading 0.8s linear infinite',
    'display:none',
    'pointer-events:none'
  ].join(';');

  const style = document.createElement('style');

  style.textContent =
    '@keyframes glamupApiLoading{' +
    'from{background-position:200% 0}' +
    'to{background-position:-200% 0}' +
    '}';

  document.head.appendChild(style);
  document.body.appendChild(loader);

  return loader;
}

function beginApiLoading() {
  activeApiRequests += 1;

  clearTimeout(apiLoaderTimer);

  apiLoaderTimer = window.setTimeout(() => {
    if (activeApiRequests > 0) {
      ensureApiLoader().style.display = 'block';
    }
  }, 120);
}

function endApiLoading() {
  activeApiRequests = Math.max(0, activeApiRequests - 1);

  if (activeApiRequests === 0) {
    clearTimeout(apiLoaderTimer);

    const loader = document.getElementById('globalApiLoader');

    if (loader) {
      loader.style.display = 'none';
    }
  }
}


/* =========================================================
   BACKGROUND AUTO REFRESH
   ========================================================= */

function startAutoRefresh(refreshFn, intervalMs = 5000) {
  let busy = false;

  const run = async () => {
    if (busy || document.hidden) return;

    busy = true;

    try {
      await refreshFn();
    } finally {
      busy = false;
    }
  };

  const timer = window.setInterval(run, intervalMs);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      run();
    }
  });

  return () => window.clearInterval(timer);
}


/* =========================================================
   API REQUEST HELPER
   ========================================================= */

async function api(path, { method = 'GET', body, auth = true } = {}) {
  beginApiLoading();

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (auth && getToken()) {
      headers.Authorization = `Bearer ${getToken()}`;
    }

    let res;

    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (networkError) {
      throw new Error(
        'Unable to reach the salon server. Please check your connection and try again.'
      );
    }

    const contentType = res.headers.get('content-type') || '';

    const data = contentType.includes('application/json')
      ? await res.json()
      : null;

    /*
     * 202 Accepted is intentionally treated as a successful API response.
     *
     * Cashfree payment verification can temporarily return:
     *
     * {
     *   status: 'pending',
     *   appointmentPaymentStatus: 'unpaid'
     * }
     *
     * The customer payment flow uses this response to retry verification
     * while Cashfree finishes processing the payment.
     */
    if (!res.ok) {
      if (res.status === 401 && auth && getToken()) {
        clearSession();
        window.location.href = '/html/index.html';

        throw new Error(
          'Your session has expired. Please log in again.'
        );
      }

      const message =
        (data && data.message) ||
        `Request failed (${res.status})`;

      throw new Error(message);
    }

    return data;
  } finally {
    endApiLoading();
  }
}


/* =========================================================
   AUTH
   ========================================================= */

function logout() {
  clearSession();
  window.location.href = '/html/index.html';
}


/* =========================================================
   FORMATTING HELPERS
   ========================================================= */

function fmtMoney(n) {
  return `₹${Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatTime12(time) {
  if (!time) return '';

  const [h, m] = String(time).split(':').map(Number);

  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;

  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDateLong(date) {
  if (!date) return '';

  const [y, m, d] = String(date).split('-').map(Number);

  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function badge(text) {
  const safe = escapeHtml(text);

  return `<span class="badge ${safe}">${safe}</span>`;
}


/* =========================================================
   NOTIFICATION CENTER
   ========================================================= */

function notificationStorageKey() {
  const user = getUser();

  return user
    ? `glowSalonNotifications:${user.id}`
    : 'glowSalonNotifications:guest';
}

function getNotifications() {
  try {
    return JSON.parse(
      localStorage.getItem(notificationStorageKey()) || '[]'
    );
  } catch {
    return [];
  }
}

function saveNotifications(items) {
  localStorage.setItem(
    notificationStorageKey(),
    JSON.stringify(items.slice(0, 30))
  );
}

function renderNotifications() {
  const list = document.getElementById('notificationList');
  const count = document.getElementById('notificationCount');

  if (!list || !count) return;

  const items = getNotifications();

  count.textContent = items.length;
  count.hidden = items.length === 0;

  list.innerHTML = items.length
    ? items.map((item) => `
        <button
          type="button"
          class="notification-item"
          data-notification-id="${escapeHtml(item.id)}"
        >
          <strong>
            ${escapeHtml(item.title || 'Notification')}
          </strong>

          <span>
            ${escapeHtml(item.message)}
          </span>

          <small>
            ${escapeHtml(item.time || '')}
          </small>
        </button>
      `).join('')
    : '<div class="notification-empty">No notifications yet.</div>';
}

function showNotificationToast(title, message) {
  const old = document.getElementById('notificationToast');

  old?.remove();

  const toast = document.createElement('div');

  toast.id = 'notificationToast';
  toast.className = 'notification-toast';

  toast.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('notification-toast--hide');

    window.setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

function pushNotification(title, message, stableId = null) {
  const items = getNotifications();

  /*
   * Stable notifications are replaced rather than duplicated.
   * This is important for completion-code notifications.
   */
  if (stableId) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].id === stableId) {
        items.splice(i, 1);
      }
    }
  }

  items.unshift({
    id:
      stableId ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    time: new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  });

  saveNotifications(items);
  renderNotifications();
  showNotificationToast(title, message);
}

function initNotifications() {
  const btn = document.getElementById('notificationBtn');
  const panel = document.getElementById('notificationPanel');
  const center = document.getElementById('notificationCenter');
  const clear = document.getElementById('clearNotificationsBtn');

  if (!btn || !panel || !center) return;

  renderNotifications();

  btn.addEventListener('click', (event) => {
    event.stopPropagation();

    const open = !panel.hidden;

    panel.hidden = open;

    btn.setAttribute(
      'aria-expanded',
      String(!open)
    );
  });

  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  clear?.addEventListener('click', () => {
    saveNotifications([]);
    renderNotifications();
  });

  document.addEventListener('click', () => {
    panel.hidden = true;

    btn.setAttribute(
      'aria-expanded',
      'false'
    );
  });
}

initNotifications();
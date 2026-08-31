const API_BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }
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

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Invoice downloads etc return a binary body, not JSON — caller handles those separately.
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function logout() {
  clearSession();
  window.location.href = '/html/index.html';
}

function fmtMoney(n) { return `₹${Number(n).toFixed(2)}`; }

function badge(text) {
  return `<span class="badge ${text}">${text}</span>`;
}

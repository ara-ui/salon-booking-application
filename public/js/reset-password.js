
const msg = document.getElementById('msg');
const form = document.getElementById('resetPasswordForm');

const INVALID_LINK_MESSAGE =
  'This reset link is invalid, expired, or has already been used. Please request a new reset link.';

const token = new URLSearchParams(window.location.search).get('token');

function showInvalidLink() {
  form.style.display = 'none';
  msg.innerHTML = `<p class="error">${INVALID_LINK_MESSAGE}</p>`;
}

(async function validateTokenOnLoad() {
  if (!token) {
    showInvalidLink();
    return;
  }

  form.style.display = 'none'; // hidden until we confirm the token is valid

  try {
    await api(`/auth/validate-reset-token?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      auth: false,
    });
    form.style.display = ''; // token is valid — reveal the form
  } catch (err) {
    showInvalidLink();
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.innerHTML = '';

  const password = document.getElementById('rpPassword').value;
  const confirmPassword = document.getElementById('rpConfirmPassword').value;
  if (password !== confirmPassword) {
    msg.innerHTML = '<p class="error">Passwords do not match.</p>';
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const data = await api('/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: { token, password },
    });
    msg.innerHTML = `<p class="success">${data.message} Redirecting to login…</p>`;
    setTimeout(() => { window.location.href = '/html/index.html'; }, 2000);
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
    submitBtn.disabled = false;
  }
});
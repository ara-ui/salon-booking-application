const msg = document.getElementById('msg');
const form = document.getElementById('resetPasswordForm');

const token = new URLSearchParams(window.location.search).get('token');
if (!token) {
  form.style.display = 'none';
  msg.innerHTML = '<p class="error">This reset link is missing its token. Please request a new one from the forgot-password page.</p>';
}

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

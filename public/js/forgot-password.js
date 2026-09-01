
const msg = document.getElementById('msg');
const form = document.getElementById('forgotPasswordForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.innerHTML = '';

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const data = await api('/auth/forgot-password', {
      method: 'POST',
      auth: false,
      body: { email: document.getElementById('fpEmail').value },
    });
    msg.innerHTML = `<p class="success">${data.message}</p>`;
    form.reset();
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  } finally {
    submitBtn.disabled = false;
  }
});

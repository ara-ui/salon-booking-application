const existing = getUser();
if (existing && getToken()) window.location.href = `/html/${existing.role}.html`;

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginCard = document.getElementById('loginCard');
const registerCard = document.getElementById('registerCard');
const msg = document.getElementById('msg');

function showAuthMessage(text, type = 'error') {
  msg.innerHTML = text ? `<p class="${type}">${escapeHtml(text)}</p>` : '';
}

function switchTab(tab) {
  const login = tab === 'login';
  tabLogin.classList.toggle('active', login);
  tabRegister.classList.toggle('active', !login);
  loginCard.style.display = login ? '' : 'none';
  registerCard.style.display = login ? 'none' : '';
  showAuthMessage('');
}

tabLogin.addEventListener('click', () => switchTab('login'));
tabRegister.addEventListener('click', () => switchTab('register'));

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthMessage('');
  const button = e.target.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const data = await api('/auth/login', {
      method: 'POST', auth: false,
      body: {
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      },
    });
    saveSession(data.token, data.user);
    window.location.href = `/html/${data.user.role}.html`;
  } catch (err) {
    showAuthMessage(err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthMessage('');
  const button = e.target.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Creating account…';
  try {
    const data = await api('/auth/register', {
      method: 'POST', auth: false,
      body: {
        name: document.getElementById('regName').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        phone: document.getElementById('regPhone').value.trim(),
        password: document.getElementById('regPassword').value,
      },
    });
    saveSession(data.token, data.user);
    window.location.href = `/html/${data.user.role}.html`;
  } catch (err) {
    showAuthMessage(err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Create account';
  }
});

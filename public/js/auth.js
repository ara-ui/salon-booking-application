const existing = getUser();
if (existing && getToken()) window.location.href = `/html/${existing.role}.html`;

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginCard = document.getElementById('loginCard');
const registerCard = document.getElementById('registerCard');
const msg = document.getElementById('msg');

tabLogin.onclick = () => { tabLogin.classList.add('active'); tabRegister.classList.remove('active'); loginCard.style.display=''; registerCard.style.display='none'; };
tabRegister.onclick = () => { tabRegister.classList.add('active'); tabLogin.classList.remove('active'); registerCard.style.display=''; loginCard.style.display='none'; };

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.innerHTML = '';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
      },
    });
    saveSession(data.token, data.user);
    window.location.href = `/html/${data.user.role}.html`;
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.innerHTML = '';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        phone: document.getElementById('regPhone').value,
        password: document.getElementById('regPassword').value,
      },
    });
    saveSession(data.token, data.user);
    window.location.href = `/html/${data.user.role}.html`;
  } catch (err) {
    msg.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

const user = requireRole('admin');

if (user) {
  document.getElementById('welcome').textContent = `Hi, ${user.name}`;
}


function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.style.display = 'none';
  });

  const selectedTab = document.getElementById(`tab-${name}`);

  if (selectedTab) {
    selectedTab.style.display = '';
  }

  document.querySelectorAll('.tabs button').forEach(button => {
    button.classList.remove('active');
  });

  if (btn) {
    btn.classList.add('active');
  }
}


if (user) {
  loadUsers();
  loadAdmins();
  loadServices();
  loadStaff();
  loadAppointments();
  loadSettings();
  loadPayments();
}
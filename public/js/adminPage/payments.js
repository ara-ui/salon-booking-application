async function loadPayments() {
  const payments = await api('/payments');

  const succeeded = payments.filter(p => p.status === 'succeeded');
  const pending = payments.filter(p => p.status === 'pending');
  const failed = payments.filter(p => p.status === 'failed');

  const revenue = succeeded.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  document.getElementById('paymentSummaryCards').innerHTML = `
    <div class="card payment-summary-card">
      <div class="ps-label">Total payments</div>
      <div class="ps-value">${payments.length}</div>
    </div>

    <div class="card payment-summary-card">
      <div class="ps-label">Successful</div>
      <div class="ps-value">${succeeded.length}</div>
    </div>

    <div class="card payment-summary-card">
      <div class="ps-label">Pending</div>
      <div class="ps-value">${pending.length}</div>
    </div>

    <div class="card payment-summary-card">
      <div class="ps-label">Failed</div>
      <div class="ps-value">${failed.length}</div>
    </div>

    <div class="card payment-summary-card">
      <div class="ps-label">Total revenue</div>
      <div class="ps-value">${fmtMoney(revenue)}</div>
    </div>
  `;

  document.getElementById('paymentRows').innerHTML =
    payments.map(p => `
      <tr>
        <td>${escapeHtml(p.Appointment.customer.name)}</td>
        <td>${escapeHtml(p.Appointment.customer.email)}</td>
        <td>#${p.Appointment.id}</td>
        <td>${escapeHtml(p.Appointment.Service.name)}</td>
        <td>${fmtMoney(p.amount)}</td>
        <td>${badge(p.status)}</td>
        <td>${escapeHtml(p.providerPaymentId || '—')}</td>
        <td>${new Date(p.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="8">No payments yet.</td>
      </tr>
    `;
}
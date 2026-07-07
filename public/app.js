'use strict';

const API_BASE = '/api';

// ---------- View switching ----------
const tabButtons = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');

function switchView(name) {
  views.forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'tickets') loadTickets();
}

tabButtons.forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

// ---------- Toast ----------
let toastTimer = null;
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

// ---------- Dashboard ----------
async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE}/dashboard`);
    const stats = await res.json();
    document.getElementById('stat-total').textContent = stats.totalTickets;
    document.getElementById('stat-open').textContent = stats.openTickets;
    document.getElementById('stat-progress').textContent = stats.inProgressTickets;
    document.getElementById('stat-resolved').textContent = stats.resolvedTickets;
    document.getElementById('stat-urgent').textContent = stats.urgentTickets;
  } catch (err) {
    showToast('Could not load dashboard stats.', true);
  }
}

// ---------- Ticket list ----------
const searchInput = document.getElementById('search-input');
const filterPriority = document.getElementById('filter-priority');
const filterStatus = document.getElementById('filter-status');
const sortOrder = document.getElementById('sort-order');
const filterUrgent = document.getElementById('filter-urgent');
const exportLink = document.getElementById('export-csv');

let searchDebounce = null;

function currentFilters() {
  return {
    search: searchInput.value.trim(),
    priority: filterPriority.value,
    status: filterStatus.value,
    sort: sortOrder.value,
    urgentOnly: filterUrgent.checked ? 'true' : '',
  };
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function statusBadgeClass(status) {
  return `badge badge-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

function priorityBadgeClass(priority) {
  return `badge badge-priority-${priority.toLowerCase()}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadTickets() {
  const query = buildQuery(currentFilters());
  exportLink.href = `${API_BASE}/tickets/export.csv${query ? '?' + query : ''}`;

  try {
    const res = await fetch(`${API_BASE}/tickets${query ? '?' + query : ''}`);
    const data = await res.json();
    renderTickets(data.tickets);
  } catch (err) {
    showToast('Could not load tickets.', true);
  }
}

function renderTickets(tickets) {
  const tbody = document.getElementById('ticket-table-body');
  const emptyState = document.getElementById('empty-state');
  tbody.innerHTML = '';

  if (!tickets.length) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  tickets.forEach((t) => {
    const tr = document.createElement('tr');
    tr.dataset.id = t.id;
    tr.innerHTML = `
      <td data-label="Reference">${t.reference}</td>
      <td data-label="Customer">${escapeHtml(t.customerName)}</td>
      <td data-label="Subject">${escapeHtml(t.subject)}${t.isUrgent ? '<span class="urgent-flag">URGENT</span>' : ''}</td>
      <td data-label="Priority"><span class="${priorityBadgeClass(t.priority)}">${t.priority}</span></td>
      <td data-label="Status"><span class="${statusBadgeClass(t.status)}">${t.status}</span></td>
      <td data-label="Created">${formatDate(t.createdAt)}</td>
    `;
    tr.addEventListener('click', () => openTicketDetail(t.id));
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

[searchInput].forEach((el) => el.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadTickets, 250);
}));
[filterPriority, filterStatus, sortOrder, filterUrgent].forEach((el) => el.addEventListener('change', loadTickets));

// ---------- Ticket detail modal ----------
const modal = document.getElementById('ticket-modal');
const modalBody = document.getElementById('modal-body');
document.getElementById('modal-close').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

async function openTicketDetail(id) {
  try {
    const res = await fetch(`${API_BASE}/tickets/${id}`);
    if (!res.ok) throw new Error('not found');
    const { ticket } = await res.json();
    renderTicketDetail(ticket);
    modal.hidden = false;
  } catch (err) {
    showToast('Could not load ticket.', true);
  }
}

function renderTicketDetail(t) {
  modalBody.innerHTML = `
    <h2>${t.reference} ${t.isUrgent ? '<span class="urgent-flag">URGENT</span>' : ''}</h2>
    <div class="detail-row"><div class="detail-label">Customer</div><div class="detail-value">${escapeHtml(t.customerName)} — ${escapeHtml(t.customerEmail)}</div></div>
    <div class="detail-row"><div class="detail-label">Subject</div><div class="detail-value">${escapeHtml(t.subject)}</div></div>
    <div class="detail-row"><div class="detail-label">Description</div><div class="detail-value">${escapeHtml(t.description)}</div></div>
    <div class="detail-row"><div class="detail-label">Priority</div><div class="detail-value"><span class="${priorityBadgeClass(t.priority)}">${t.priority}</span></div></div>
    <div class="detail-row">
      <div class="detail-label">Status</div>
      <select id="detail-status-select">
        <option value="Open" ${t.status === 'Open' ? 'selected' : ''}>Open</option>
        <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
        <option value="Resolved" ${t.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
      </select>
    </div>
    <div class="detail-row"><div class="detail-label">Created</div><div class="detail-value">${formatDate(t.createdAt)}</div></div>
    <div class="detail-row"><div class="detail-label">Last Updated</div><div class="detail-value">${formatDate(t.updatedAt)}</div></div>
    <button class="btn btn-primary" id="detail-save-btn">Update Status</button>
    <span id="detail-status-msg" style="margin-left:10px; font-size:13px;"></span>
  `;

  document.getElementById('detail-save-btn').addEventListener('click', async () => {
    const newStatus = document.getElementById('detail-status-select').value;
    const msgEl = document.getElementById('detail-status-msg');
    try {
      const res = await fetch(`${API_BASE}/tickets/${t.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        msgEl.textContent = data.error || 'Update failed.';
        msgEl.style.color = 'var(--urgent)';
        return;
      }
      msgEl.textContent = 'Saved.';
      msgEl.style.color = 'var(--ok)';
      loadTickets();
      loadDashboard();
    } catch (err) {
      msgEl.textContent = 'Network error.';
      msgEl.style.color = 'var(--urgent)';
    }
  });
}

// ---------- New ticket form ----------
const form = document.getElementById('ticket-form');
const duplicateWarning = document.getElementById('duplicate-warning');
const generalError = document.getElementById('form-general-error');

function clearFormErrors() {
  document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  duplicateWarning.hidden = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormErrors();

  const payload = {
    customerName: form.customerName.value.trim(),
    customerEmail: form.customerEmail.value.trim(),
    subject: form.subject.value.trim(),
    description: form.description.value.trim(),
    priority: form.priority.value,
  };

  try {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.errors) {
        Object.entries(data.errors).forEach(([field, message]) => {
          const target = document.querySelector(`[data-error-for="${field}"]`);
          if (target) target.textContent = message;
          else generalError.textContent = message;
        });
      }
      return;
    }

    if (data.duplicateEmail) {
      showToast(
        `Ticket ${data.ticket.reference} created. Note: this customer has ${data.priorTicketCount} prior ticket(s).`
      );
    } else {
      showToast(`Ticket ${data.ticket.reference} created.`);
    }

    form.reset();
    switchView('tickets');
  } catch (err) {
    generalError.textContent = 'Network error. Please try again.';
  }
});

// ---------- Init ----------
loadDashboard();

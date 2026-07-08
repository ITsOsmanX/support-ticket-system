'use strict';

const { validateTicketInput, validateStatus } = require('./validation');


function computeIsUrgent({ priority, description }) {
  const highPriority = priority === 'High';
  const mentionsUrgent = typeof description === 'string' && description.toLowerCase().includes('urgent');
  return highPriority || mentionsUrgent;
}

function formatReference(id) {
  return `TCK-${String(id).padStart(6, '0')}`;
}

function rowToTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    subject: row.subject,
    description: row.description,
    priority: row.priority,
    status: row.status,
    isUrgent: !!row.is_urgent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class TicketService {
  constructor(db) {
    this.db = db;
  }

  
  findByEmail(email) {
    const stmt = this.db.prepare(
      `SELECT * FROM tickets WHERE customer_email = ? ORDER BY created_at DESC`
    );
    return stmt.all(email.trim().toLowerCase()).map(rowToTicket);
  }

  createTicket(input) {
    const { valid, errors } = validateTicketInput(input);
    if (!valid) {
      return { ok: false, errors };
    }

    const now = new Date().toISOString();
    const priority = input.priority;
    const status = input.status || 'Open';
    const isUrgent = computeIsUrgent({ priority, description: input.description }) ? 1 : 0;
    const normalizedEmail = input.customerEmail.trim().toLowerCase();

    const priorTickets = this.findByEmail(normalizedEmail);

    const insert = this.db.prepare(`
      INSERT INTO tickets
        (reference, customer_name, customer_email, subject, description, priority, status, is_urgent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);


    const result = insert.run(
      'PENDING',
      input.customerName.trim(),
      normalizedEmail,
      input.subject.trim(),
      input.description.trim(),
      priority,
      status,
      isUrgent,
      now,
      now
    );

    const newId = Number(result.lastInsertRowid);
    const reference = formatReference(newId);
    this.db.prepare(`UPDATE tickets SET reference = ? WHERE id = ?`).run(reference, newId);

    const ticket = this.getTicketById(newId);
    return { ok: true, ticket, duplicateEmail: priorTickets.length > 0, priorTicketCount: priorTickets.length };
  }

  getTicketById(id) {
    const row = this.db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
    return rowToTicket(row);
  }


  listTickets(filters = {}) {
    let query = `SELECT * FROM tickets WHERE 1=1`;
    const params = [];

    if (filters.search) {
      query += ` AND (LOWER(customer_name) LIKE ? OR LOWER(customer_email) LIKE ? OR LOWER(subject) LIKE ?)`;
      const term = `%${filters.search.toLowerCase()}%`;
      params.push(term, term, term);
    }

    if (filters.priority) {
      query += ` AND priority = ?`;
      params.push(filters.priority);
    }

    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }

    if (filters.urgentOnly) {
      query += ` AND is_urgent = 1`;
    }

    const direction = filters.sort === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY created_at ${direction}`;

    const rows = this.db.prepare(query).all(...params);
    return rows.map(rowToTicket);
  }

  updateTicketStatus(id, status) {
    const { valid, error } = validateStatus(status);
    if (!valid) {
      return { ok: false, error };
    }

    const existing = this.getTicketById(id);
    if (!existing) {
      return { ok: false, notFound: true };
    }

    const now = new Date().toISOString();
    this.db.prepare(`UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, id);
    return { ok: true, ticket: this.getTicketById(id) };
  }


  updateTicket(id, fields) {
    const existing = this.getTicketById(id);
    if (!existing) {
      return { ok: false, notFound: true };
    }

    const merged = {
      customerName: fields.customerName ?? existing.customerName,
      customerEmail: fields.customerEmail ?? existing.customerEmail,
      subject: fields.subject ?? existing.subject,
      description: fields.description ?? existing.description,
      priority: fields.priority ?? existing.priority,
      status: fields.status ?? existing.status,
    };

    const { valid, errors } = validateTicketInput(merged);
    if (!valid) {
      return { ok: false, errors };
    }

    const isUrgent = computeIsUrgent({ priority: merged.priority, description: merged.description }) ? 1 : 0;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE tickets SET
        customer_name = ?, customer_email = ?, subject = ?, description = ?,
        priority = ?, status = ?, is_urgent = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.customerName.trim(),
      merged.customerEmail.trim().toLowerCase(),
      merged.subject.trim(),
      merged.description.trim(),
      merged.priority,
      merged.status,
      isUrgent,
      now,
      id
    );

    return { ok: true, ticket: this.getTicketById(id) };
  }

  getDashboardStats() {
    const total = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets`).get().c;
    const open = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'Open'`).get().c;
    const inProgress = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'In Progress'`).get().c;
    const resolved = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'Resolved'`).get().c;
    const urgent = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE is_urgent = 1`).get().c;

    return {
      totalTickets: total,
      openTickets: open,
      inProgressTickets: inProgress,
      resolvedTickets: resolved,
      urgentTickets: urgent,
    };
  }

  exportCsv(filters = {}) {
    const tickets = this.listTickets(filters);
    const header = [
      'Reference', 'Customer Name', 'Customer Email', 'Subject', 'Description',
      'Priority', 'Status', 'Urgent', 'Created At', 'Updated At',
    ];

    const escape = (value) => {
      const str = String(value ?? '');
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = tickets.map((t) => [
      t.reference, t.customerName, t.customerEmail, t.subject, t.description,
      t.priority, t.status, t.isUrgent ? 'Yes' : 'No', t.createdAt, t.updatedAt,
    ].map(escape).join(','));

    return [header.join(','), ...rows].join('\n');
  }
}

module.exports = { TicketService, computeIsUrgent, formatReference };

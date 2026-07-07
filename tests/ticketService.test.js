'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDatabase } = require('../src/db');
const { TicketService } = require('../src/ticketService');

function freshService() {
  const db = createDatabase(':memory:');
  return new TicketService(db);
}

test('createTicket persists a valid ticket with default status Open', () => {
  const service = freshService();
  const result = service.createTicket({
    customerName: 'Ada Lovelace',
    customerEmail: 'Ada@Example.com',
    subject: 'Export broken',
    description: 'CSV export button does nothing when clicked.',
    priority: 'Medium',
  });

  assert.equal(result.ok, true);
  assert.equal(result.ticket.status, 'Open');
  assert.equal(result.ticket.customerEmail, 'ada@example.com'); // normalized
  assert.match(result.ticket.reference, /^TCK-\d{6}$/);
});

test('createTicket rejects invalid input and does not touch the database', () => {
  const service = freshService();
  const result = service.createTicket({ customerName: '', customerEmail: 'bad', subject: '', description: 'short', priority: 'Nope' });

  assert.equal(result.ok, false);
  assert.ok(result.errors.customerName);
  assert.ok(result.errors.customerEmail);
  assert.ok(result.errors.subject);
  assert.ok(result.errors.description);
  assert.ok(result.errors.priority);
  assert.equal(service.listTickets().length, 0);
});

test('createTicket marks High priority tickets as urgent automatically', () => {
  const service = freshService();
  const result = service.createTicket({
    customerName: 'Grace Hopper',
    customerEmail: 'grace@example.com',
    subject: 'Server down',
    description: 'Production is completely unreachable.',
    priority: 'High',
  });
  assert.equal(result.ticket.isUrgent, true);
});

test('createTicket marks tickets mentioning "urgent" as urgent even at Low priority', () => {
  const service = freshService();
  const result = service.createTicket({
    customerName: 'Grace Hopper',
    customerEmail: 'grace@example.com',
    subject: 'Question',
    description: 'This is urgent, please respond quickly.',
    priority: 'Low',
  });
  assert.equal(result.ticket.isUrgent, true);
});

test('createTicket flags (but does not block) a duplicate customer email', () => {
  const service = freshService();
  service.createTicket({
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    subject: 'First issue',
    description: 'Something went wrong the first time.',
    priority: 'Low',
  });

  const second = service.createTicket({
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    subject: 'Second issue',
    description: 'Something went wrong a second time.',
    priority: 'Low',
  });

  assert.equal(second.ok, true);
  assert.equal(second.duplicateEmail, true);
  assert.equal(second.priorTicketCount, 1);
  assert.equal(service.listTickets().length, 2);
});

test('updateTicketStatus updates status and bumps updatedAt', async () => {
  const service = freshService();
  const created = service.createTicket({
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    subject: 'Issue',
    description: 'A perfectly normal description.',
    priority: 'Low',
  }).ticket;

  await new Promise((resolve) => setTimeout(resolve, 5)); // ensure timestamp differs

  const result = service.updateTicketStatus(created.id, 'In Progress');
  assert.equal(result.ok, true);
  assert.equal(result.ticket.status, 'In Progress');
  assert.notEqual(result.ticket.updatedAt, created.updatedAt);
});

test('updateTicketStatus rejects an invalid status value', () => {
  const service = freshService();
  const created = service.createTicket({
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    subject: 'Issue',
    description: 'A perfectly normal description.',
    priority: 'Low',
  }).ticket;

  const result = service.updateTicketStatus(created.id, 'Closed');
  assert.equal(result.ok, false);
  assert.ok(result.error);

  const unchanged = service.getTicketById(created.id);
  assert.equal(unchanged.status, 'Open');
});

test('updateTicketStatus reports notFound for a non-existent ticket', () => {
  const service = freshService();
  const result = service.updateTicketStatus(9999, 'Open');
  assert.equal(result.notFound, true);
});

test('listTickets filters by status, priority, and search term', () => {
  const service = freshService();
  service.createTicket({ customerName: 'A', customerEmail: 'a@example.com', subject: 'Login problem', description: 'Cannot log in at all.', priority: 'Low' });
  service.createTicket({ customerName: 'B', customerEmail: 'b@example.com', subject: 'Billing question', description: 'Was charged twice this month.', priority: 'High' });

  assert.equal(service.listTickets({ status: 'Open' }).length, 2);
  assert.equal(service.listTickets({ priority: 'High' }).length, 1);
  assert.equal(service.listTickets({ search: 'billing' }).length, 1);
  assert.equal(service.listTickets({ search: 'nonexistent' }).length, 0);
});

test('getDashboardStats reflects current ticket counts', () => {
  const service = freshService();
  service.createTicket({ customerName: 'A', customerEmail: 'a@example.com', subject: 'S1', description: 'A normal description here.', priority: 'High' });
  const t2 = service.createTicket({ customerName: 'B', customerEmail: 'b@example.com', subject: 'S2', description: 'Another normal description.', priority: 'Low' }).ticket;
  service.updateTicketStatus(t2.id, 'Resolved');

  const stats = service.getDashboardStats();
  assert.equal(stats.totalTickets, 2);
  assert.equal(stats.resolvedTickets, 1);
  assert.equal(stats.openTickets, 1);
  assert.equal(stats.urgentTickets, 1);
});

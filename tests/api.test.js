'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Point at a throwaway DB file before requiring server.js, so this test
// suite never touches the real data/tickets.db used by `npm start`.
const tmpDb = path.join(os.tmpdir(), `tickets-test-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;
process.env.PORT = 0; // let the OS pick a free port

const { server, db } = require('../server');

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  // Close the SQLite handle before deleting the file - on Windows the OS
  // keeps an open database file locked, so rm would otherwise fail with EPERM.
  try { db.close(); } catch { /* already closed */ }
  fs.rmSync(tmpDb, { force: true, maxRetries: 3 });
});

test('POST /api/tickets creates a ticket end-to-end', async () => {
  const res = await fetch(`${baseUrl}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'End To End',
      customerEmail: 'e2e@example.com',
      subject: 'Integration test',
      description: 'Making sure the HTTP layer works end to end.',
      priority: 'High',
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.ticket.status, 'Open');
  assert.equal(data.ticket.isUrgent, true);
});

test('POST /api/tickets returns 400 with field errors for invalid input', async () => {
  const res = await fetch(`${baseUrl}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName: '', customerEmail: 'bad-email', subject: '', description: 'x', priority: 'urgent-ish' }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.errors.customerName);
  assert.ok(data.errors.customerEmail);
});

test('GET /api/dashboard returns aggregate counts', async () => {
  const res = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(res.status, 200);
  const stats = await res.json();
  assert.ok(typeof stats.totalTickets === 'number');
  assert.ok(typeof stats.urgentTickets === 'number');
});

test('PATCH /api/tickets/:id/status rejects unsupported status values', async () => {
  const createRes = await fetch(`${baseUrl}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Status Test',
      customerEmail: 'status@example.com',
      subject: 'Status flow',
      description: 'Testing invalid status transitions here.',
      priority: 'Low',
    }),
  });
  const { ticket } = await createRes.json();

  const badStatusRes = await fetch(`${baseUrl}/api/tickets/${ticket.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Cancelled' }),
  });

  assert.equal(badStatusRes.status, 400);

  const goodStatusRes = await fetch(`${baseUrl}/api/tickets/${ticket.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Resolved' }),
  });
  assert.equal(goodStatusRes.status, 200);
  const updated = await goodStatusRes.json();
  assert.equal(updated.ticket.status, 'Resolved');
});

test('GET /api/tickets/:id returns 404 for a missing ticket', async () => {
  const res = await fetch(`${baseUrl}/api/tickets/999999`);
  assert.equal(res.status, 404);
});

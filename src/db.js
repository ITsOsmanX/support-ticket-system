'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Creates (or opens) the SQLite database and ensures the schema exists.
 * Using Node's built-in `node:sqlite` module (stable behind a flag-free
 * experimental API since Node 22.5) means the project needs zero npm
 * dependencies to persist data - `node server.js` is enough.
 *
 * @param {string} dbPath - path to the sqlite file, or ':memory:' for tests
 * @returns {DatabaseSync}
 */
function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High')),
      status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'In Progress', 'Resolved')),
      is_urgent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(customer_email);`);

  return db;
}

module.exports = { createDatabase };

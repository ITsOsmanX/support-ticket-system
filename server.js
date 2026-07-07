'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { createDatabase } = require('./src/db');
const { TicketService } = require('./src/ticketService');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'tickets.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

const db = createDatabase(DB_PATH);
const ticketService = new TicketService(db);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendCsv(res, filename, csvString) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end(csvString);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    const LIMIT = 1_000_000; // 1MB guard against runaway payloads

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMIT) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });

    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  try {
    // GET /api/dashboard
    if (method === 'GET' && pathname === '/api/dashboard') {
      return sendJson(res, 200, ticketService.getDashboardStats());
    }

    // GET /api/tickets/export.csv  (initiative feature)
    if (method === 'GET' && pathname === '/api/tickets/export.csv') {
      const filters = {
        search: url.searchParams.get('search') || undefined,
        priority: url.searchParams.get('priority') || undefined,
        status: url.searchParams.get('status') || undefined,
        sort: url.searchParams.get('sort') || undefined,
      };
      const csv = ticketService.exportCsv(filters);
      return sendCsv(res, 'tickets.csv', csv);
    }

    // GET /api/tickets/by-email/:email  (customer ticket history)
    if (method === 'GET' && pathname.startsWith('/api/tickets/by-email/')) {
      const email = decodeURIComponent(pathname.split('/').pop());
      return sendJson(res, 200, { tickets: ticketService.findByEmail(email) });
    }

    // GET /api/tickets
    if (method === 'GET' && pathname === '/api/tickets') {
      const filters = {
        search: url.searchParams.get('search') || undefined,
        priority: url.searchParams.get('priority') || undefined,
        status: url.searchParams.get('status') || undefined,
        sort: url.searchParams.get('sort') || undefined,
        urgentOnly: url.searchParams.get('urgentOnly') === 'true',
      };
      return sendJson(res, 200, { tickets: ticketService.listTickets(filters) });
    }

    // POST /api/tickets
    if (method === 'POST' && pathname === '/api/tickets') {
      const body = await readJsonBody(req);
      const result = ticketService.createTicket(body);
      if (!result.ok) {
        return sendJson(res, 400, { errors: result.errors });
      }
      return sendJson(res, 201, {
        ticket: result.ticket,
        duplicateEmail: result.duplicateEmail,
        priorTicketCount: result.priorTicketCount,
      });
    }

    // GET /api/tickets/:id
    const ticketIdMatch = pathname.match(/^\/api\/tickets\/(\d+)$/);
    if (method === 'GET' && ticketIdMatch) {
      const ticket = ticketService.getTicketById(Number(ticketIdMatch[1]));
      if (!ticket) return sendJson(res, 404, { error: 'Ticket not found' });
      return sendJson(res, 200, { ticket });
    }

    // PATCH /api/tickets/:id
    if (method === 'PATCH' && ticketIdMatch) {
      const body = await readJsonBody(req);
      const result = ticketService.updateTicket(Number(ticketIdMatch[1]), body);
      if (result.notFound) return sendJson(res, 404, { error: 'Ticket not found' });
      if (!result.ok) return sendJson(res, 400, { errors: result.errors });
      return sendJson(res, 200, { ticket: result.ticket });
    }

    // PATCH /api/tickets/:id/status
    const statusMatch = pathname.match(/^\/api\/tickets\/(\d+)\/status$/);
    if (method === 'PATCH' && statusMatch) {
      const body = await readJsonBody(req);
      const result = ticketService.updateTicketStatus(Number(statusMatch[1]), body.status);
      if (result.notFound) return sendJson(res, 404, { error: 'Ticket not found' });
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, { ticket: result.ticket });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err.message === 'Invalid JSON body') {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }
    console.error(err);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
  } else {
    serveStatic(req, res, url.pathname);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Support ticket system running at http://localhost:${PORT}`);
  });
}

module.exports = { server, ticketService, db };

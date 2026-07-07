# Support Desk — Customer Support Ticket System

A small full-stack app for creating, organizing, and managing customer support tickets.

## Project Overview

Support staff can submit tickets, browse/search/filter them, open a ticket to see full details,
change its status, and check dashboard-level stats. Tickets are automatically flagged as **urgent**
when their priority is High or their description mentions "urgent".

## Technology Stack

| Layer     | Choice                                                    |
|-----------|------------------------------------------------------------|
| Frontend  | Vanilla HTML/CSS/JavaScript (no build step, no framework)  |
| Backend   | Node.js, built-in `http` module (no Express)                |
| Database  | SQLite, via Node's built-in `node:sqlite` module             |
| Tests     | Node's built-in test runner (`node:test` + `node:assert`)    |

**Why zero external dependencies?** Node 22.5+ ships an experimental but functional `node:sqlite`
module and has had a stable built-in test runner (`node:test`) since Node 18. That's enough to
build a real, persistent, tested API without installing Express, a SQLite driver, or a test
framework. The trade-off: you need **Node.js 22.5 or newer**, and `node:sqlite` is still
labelled experimental by the Node team (you'll see a one-line `ExperimentalWarning` in the
console — this is expected and harmless). If a review environment can't use Node 22.5+, the
straightforward fix is swapping `src/db.js` for `better-sqlite3` and `server.js`'s routing for
Express; the `TicketService` layer (all the actual business logic) wouldn't need to change at all,
since it's already isolated behind a plain `db.prepare(...).run/get/all` interface.

The frontend is plain JS on purpose: the brief doesn't require a component framework, the app is
a handful of views, and it means `index.html` can be opened by literally any static file server
with no `npm install` or build step. There's no view library and no client-side router: the
"pages" are just `<section>` elements toggled with a `hidden`/`active` class.

## Setup Instructions

### Requirements
- Node.js **22.5.0 or newer** (for `node:sqlite`). Check with `node -v`.

### Install
There is nothing to install — the project has zero runtime dependencies.
```bash
cd support-ticket-system
```

### Database setup
No manual setup needed. On first run, `server.js` creates `data/tickets.db` and the `tickets`
table automatically (see `src/db.js`). The `data/` folder itself is created if missing.

### Run the backend (and frontend — same server)
```bash
npm start
# or: node server.js
```
This starts a single server on `http://localhost:3000` that serves both the JSON API
(`/api/...`) and the static frontend (`/`, `/style.css`, `/app.js`). Open
`http://localhost:3000` in a browser.

To use a different port or database location:
```bash
PORT=4000 DB_PATH=./data/custom.db node server.js
```

### Run the frontend
The frontend has no separate dev server — it's served by the same backend at
`http://localhost:3000`. There is nothing extra to run.

### Run the tests
```bash
npm test
# or: node --test
```
This runs 29 tests across four files in `tests/`:
- `validation.test.js` — input validation rules (required fields, email format, description length, priority/status enums)
- `urgentDetection.test.js` — the urgent-ticket detection rule, including case-insensitivity
- `ticketService.test.js` — create/list/update logic against a real in-memory SQLite database, including duplicate-email handling and invalid status rejection
- `api.test.js` — end-to-end HTTP tests that boot the actual server and hit real routes with `fetch`

## API Endpoint Summary

| Method | Path                              | Description                                            |
|--------|------------------------------------|----------------------------------------------------------|
| POST   | `/api/tickets`                     | Create a ticket. Returns `400` with per-field `errors` on invalid input. |
| GET    | `/api/tickets`                     | List tickets. Query params: `search`, `priority`, `status`, `sort` (`asc`/`desc`), `urgentOnly` (`true`). |
| GET    | `/api/tickets/:id`                 | Get one ticket's full detail. `404` if not found.        |
| PATCH  | `/api/tickets/:id`                 | Partially update a ticket's editable fields.              |
| PATCH  | `/api/tickets/:id/status`          | Change status. Body: `{ "status": "Open" \| "In Progress" \| "Resolved" }`. Rejects any other value with `400`. |
| GET    | `/api/dashboard`                   | Aggregate counts: total, open, in progress, resolved, urgent. |
| GET    | `/api/tickets/export.csv`          | CSV export of tickets, honoring the same filters as the list endpoint. |
| GET    | `/api/tickets/by-email/:email`     | All tickets from one customer (powers the duplicate-email warning / history). |

## Duplicate Email Decision

**Chosen approach: allow the new ticket, and show a non-blocking warning that references the
customer's prior tickets.**

When a ticket is submitted with an email address that already has tickets, `POST /api/tickets`
still creates it, but the response includes `duplicateEmail: true` and `priorTicketCount`. The
frontend surfaces this as a toast message rather than an error.

Why:
- **Blocking** the ticket punishes a legitimate use case — a customer with a second, unrelated
  problem — and would push support staff toward outright faking a different email just to get
  the form to accept the ticket.
- **Silently allowing** it (no signal at all) means support agents lose useful context: "this
  person has already filed 3 tickets this week" is often exactly what determines how a ticket
  gets triaged.
- **Warn, don't block** gets the useful signal to the person who can act on it, without adding
  friction or forcing a decision the support desk (not the submitter) should make.

Trade-offs of this approach:
- It relies on staff actually reading the warning; it won't stop accidental duplicate submissions
  the way a hard block would.
- It does not attempt fuzzy-matching similar-but-not-identical emails (e.g. `Jane@x.com` vs
  `jane+support@x.com`), so it will miss some real duplicates. Emails are normalized to
  lower-case/trimmed before comparison, which covers the most common case.
- A "linked" model (grouping tickets under a customer record) would be more powerful but is a
  bigger schema change than this scope calls for — noted below as a natural next step.

## Initiative Feature: CSV Export + Automatic Reference Numbers

**What I added:** `GET /api/tickets/export.csv`, wired to an "Export CSV" button on the ticket
list, which downloads the *currently filtered* view as a CSV file. I also added human-readable
ticket reference numbers (`TCK-000001`, `TCK-000002`, ...) generated automatically on creation,
shown throughout the UI instead of the raw numeric database id.

**Why I selected it:** Support teams routinely need to get ticket data into a spreadsheet — for a
weekly report to a manager, to share with another team that doesn't have access to this tool, or
just to do ad-hoc analysis this app doesn't support. It's also one of the few features on the
suggested list that's genuinely useful in a first version rather than a "nice to have someday."
Reference numbers were a small addition that made the rest of the UI (and the CSV) noticeably more
usable — "TCK-000042" reads far better in conversation than "ticket 42" or a raw database id.

**What problem it solves:** Turns the app from a closed system into one whose data can leave the
tool and be used elsewhere, without needing direct database access.

**What I'd improve further:** Add a date-range filter for exports, support Excel's UTF-8 BOM for
better default rendering in Excel specifically, and make the export asynchronous (streamed) if the
ticket volume ever got large enough that building the whole CSV string in memory became a problem.

## Assumptions Made

- No authentication is required (per the brief) — every request is treated as coming from a
  trusted support-team member.
- `subject` and `description` have no explicit maximum length in the brief; I didn't impose one,
  beyond the 1MB request body guard on the server to prevent abuse.
- Priority is required on ticket creation (the brief lists it as a required field). Status is
  optional on creation and defaults to `Open`; if a caller does pass a status, it's validated
  against the same enum used for the status-update endpoint.
- "Contains the word 'urgent'" is implemented as a case-insensitive **substring** match rather
  than a word-boundary match, so "urgently" also triggers the flag. I chose the simpler, more
  predictable rule (and called this out explicitly in a test) rather than guessing where the
  brief wants word boundaries to fall.
- Sorting is by creation date only (`asc`/`desc`), as that's the only sort the brief specifies.

## Known Limitations

- `node:sqlite` is an experimental Node API; a future Node release could change or remove it.
  Isolating all database access behind `TicketService`/`db.js` keeps that risk contained to two files.
- No pagination on the ticket list — fine at the data volumes a review/demo will generate, but
  would need addressing before this went to a team with years of ticket history.
- No optimistic concurrency control: if two agents update the same ticket's status at nearly the
  same instant, last write wins silently.
- The duplicate-email match is exact (after normalization), not fuzzy.
- No automated frontend/browser tests — the test suite covers validation, business logic, and the
  HTTP API, but not DOM behavior.

## What I'd Build Next

1. Pagination and a "load more" / page-size control on the ticket list.
2. A proper customer record (grouping tickets by email into a lightweight customer history view),
   which the current duplicate-email warning is a stepping stone toward.
3. Ticket comments/notes, so status changes can carry a short explanation.
4. Optimistic concurrency (an `If-Match`/version check) on status and field updates.
5. A minimal auth layer (even a shared support-team password) before this could go anywhere near
   production, since the brief explicitly scoped auth out for this exercise.

## Time Log

| Task                                             | Time            |
|---------------------------------------------------|-----------------|
| Planning & API/data design                        | 30 min          |
| Backend (server, db, validation, service layer)    | 2 hr 15 min     |
| Frontend (HTML/CSS/JS)                             | 2 hr            |
| Tests                                              | 1 hr            |
| README & polish                                    | 45 min          |
| **Total**                                          | **~6 hr 30 min** |

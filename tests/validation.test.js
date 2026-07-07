'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTicketInput, validateStatus } = require('../src/validation');

test('validateTicketInput accepts a fully valid ticket', () => {
  const { valid, errors } = validateTicketInput({
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    subject: 'Cannot log in',
    description: 'I have tried resetting my password twice with no luck.',
    priority: 'Medium',
  });
  assert.equal(valid, true);
  assert.deepEqual(errors, {});
});

test('validateTicketInput rejects missing required fields', () => {
  const { valid, errors } = validateTicketInput({});
  assert.equal(valid, false);
  assert.ok(errors.customerName);
  assert.ok(errors.customerEmail);
  assert.ok(errors.subject);
  assert.ok(errors.description);
  assert.ok(errors.priority);
});

test('validateTicketInput rejects invalid email formats', () => {
  const { valid, errors } = validateTicketInput({
    customerName: 'Jane Doe',
    customerEmail: 'not-an-email',
    subject: 'Subject',
    description: 'A description that is long enough.',
    priority: 'Low',
  });
  assert.equal(valid, false);
  assert.ok(errors.customerEmail);
});

test('validateTicketInput rejects a description shorter than 10 characters', () => {
  const { valid, errors } = validateTicketInput({
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    subject: 'Subject',
    description: 'too short',
    priority: 'Low',
  });
  assert.equal(valid, false);
  assert.ok(errors.description);
});

test('validateTicketInput rejects an invalid priority value', () => {
  const { valid, errors } = validateTicketInput({
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    subject: 'Subject',
    description: 'A description that is long enough.',
    priority: 'Critical',
  });
  assert.equal(valid, false);
  assert.ok(errors.priority);
});

test('validateStatus accepts only the three supported values', () => {
  assert.equal(validateStatus('Open').valid, true);
  assert.equal(validateStatus('In Progress').valid, true);
  assert.equal(validateStatus('Resolved').valid, true);
});

test('validateStatus rejects unsupported status values', () => {
  const result = validateStatus('Closed');
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test('validateStatus rejects empty/missing status', () => {
  assert.equal(validateStatus('').valid, false);
  assert.equal(validateStatus(undefined).valid, false);
});

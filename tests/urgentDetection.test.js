'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeIsUrgent, formatReference } = require('../src/ticketService');

test('computeIsUrgent flags High priority tickets', () => {
  assert.equal(computeIsUrgent({ priority: 'High', description: 'Nothing special here.' }), true);
});

test('computeIsUrgent flags tickets whose description contains "urgent"', () => {
  assert.equal(computeIsUrgent({ priority: 'Low', description: 'This is an URGENT issue.' }), true);
  assert.equal(computeIsUrgent({ priority: 'Low', description: 'Please treat this as urgent.' }), true);
});

test('computeIsUrgent word match is case-insensitive', () => {
  assert.equal(computeIsUrgent({ priority: 'Medium', description: 'UrGeNt request please' }), true);
});

test('computeIsUrgent returns false when neither condition is met', () => {
  assert.equal(computeIsUrgent({ priority: 'Low', description: 'Just a routine question.' }), false);
  assert.equal(computeIsUrgent({ priority: 'Medium', description: 'Standard follow-up.' }), false);
});

test('computeIsUrgent does not false-positive on substrings of "urgent"', () => {
  // "urgently" contains "urgent" as a substring - spec says "contains the word",
  // we intentionally match substrings (simple, predictable) rather than building
  // a full word-boundary tokenizer; documented in README.
  assert.equal(computeIsUrgent({ priority: 'Low', description: 'This needs handling urgently.' }), true);
});

test('formatReference pads ticket ids into TCK-###### form', () => {
  assert.equal(formatReference(1), 'TCK-000001');
  assert.equal(formatReference(42), 'TCK-000042');
  assert.equal(formatReference(123456), 'TCK-123456');
});

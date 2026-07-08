'use strict';

const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Open', 'In Progress', 'Resolved'];


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}


function validateTicketInput(data) {
  const errors = {};

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: { _general: 'Request body must be a JSON object.' } };
  }

  if (!isNonEmptyString(data.customerName)) {
    errors.customerName = 'Customer name is required.';
  }

  if (!isNonEmptyString(data.customerEmail)) {
    errors.customerEmail = 'Customer email is required.';
  } else if (!EMAIL_REGEX.test(data.customerEmail.trim())) {
    errors.customerEmail = 'Customer email must be a valid email address.';
  }

  if (!isNonEmptyString(data.subject)) {
    errors.subject = 'Subject is required.';
  }

  if (!isNonEmptyString(data.description)) {
    errors.description = 'Description is required.';
  } else if (data.description.trim().length < 10) {
    errors.description = 'Description must contain at least 10 characters.';
  }

  if (!isNonEmptyString(data.priority)) {
    errors.priority = 'Priority is required.';
  } else if (!PRIORITIES.includes(data.priority)) {
    errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}.`;
  }


  if (data.status !== undefined && data.status !== null) {
    if (!STATUSES.includes(data.status)) {
      errors.status = `Status must be one of: ${STATUSES.join(', ')}.`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}


function validateStatus(status) {
  if (!isNonEmptyString(status)) {
    return { valid: false, error: 'Status is required.' };
  }
  if (!STATUSES.includes(status)) {
    return { valid: false, error: `Status must be one of: ${STATUSES.join(', ')}.` };
  }
  return { valid: true };
}

module.exports = { validateTicketInput, validateStatus, PRIORITIES, STATUSES, EMAIL_REGEX };

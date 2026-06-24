'use strict';

/**
 * middleware/authorization.js
 *
 * Centralized ownership/role authorization helpers.
 *
 * Design goals:
 *  - No role bypass inside SQL predicates.
 *  - Ownership failures must return 404 (enumeration-safe).
 *  - Controllers should call these helpers BEFORE executing ownership-free reads.
 */

/**
 * @param {object} req
 * @returns {{isAdmin: boolean, isAgency: boolean}}
 */
function getRoleFlags(req) {
  const role = req.user?.role;
  return {
    isAdmin: role === 'admin',
    isAgency: role === 'agency',
  };
}

/**
 * Throws an error with {status, code} suitable for the existing error handler patterns.
 * Missing ownership must be 404.
 */
function throwNotFoundUnauthorized(resolverMessage = 'Resource not found') {
  const err = new Error(resolverMessage);
  err.status = 404;
  err.code = 'NOT_FOUND';
  err.structured = {
    success: false,
    code: 'NOT_FOUND',
    message: resolverMessage,
  };
  throw err;
}

/**
 * requireOwnedBooking
 *
 * Central helper that validates req.user can access booking.
 * Assumes the controller will use the provided ownership predicate or pre-fetched booking.
 *
 * @param {object} opts
 * @param {'bookingId'} opts.paramName
 * @param {(clientOrDb:any)=>Promise<object|null>} opts.fetchBookingOwned
 * @returns {Promise<object>} owned booking
 */
async function requireOwnedBooking(req, { fetchBookingOwned, resourceName = 'Booking' } = {}) {
  const bookingId = req.params?.bookingId;
  if (!bookingId) {
    const err = new Error('Invalid booking id');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (typeof fetchBookingOwned !== 'function') {
    const err = new Error('fetchBookingOwned is required');
    err.status = 500;
    err.code = 'INTERNAL_ERROR';
    throw err;
  }

  // Fetch only owned data; no role bypass in query layer.
  const row = await fetchBookingOwned({ bookingId, userId: req.user.id });
  if (!row) {
    // Enumeration-safe
    throwNotFoundUnauthorized(`${resourceName} not found`);
  }

  return row;
}

/**
 * requireOwnedPayment
 */
async function requireOwnedPayment(req, { fetchPaymentOwned, resourceName = 'Payment' } = {}) {
  const paymentId = req.params?.paymentId;
  if (!paymentId) {
    const err = new Error('Invalid payment id');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (typeof fetchPaymentOwned !== 'function') {
    const err = new Error('fetchPaymentOwned is required');
    err.status = 500;
    err.code = 'INTERNAL_ERROR';
    throw err;
  }

  const row = await fetchPaymentOwned({ paymentId, userId: req.user.id });
  if (!row) {
    throwNotFoundUnauthorized(`${resourceName} not found`);
  }

  return row;
}

/**
 * Generic stubs for future resources.
 */
async function requireOwnedTrip(req, { fetchTripOwned } = {}) {
  if (typeof fetchTripOwned !== 'function') {
    throw new Error('fetchTripOwned is required');
  }
  const tripId = req.params?.tripId;
  if (!tripId) {
    const err = new Error('Invalid trip id');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const row = await fetchTripOwned({ tripId, userId: req.user.id });
  if (!row) throwNotFoundUnauthorized('Trip not found');
  return row;
}

async function requireOwnedInvoice(req, { fetchInvoiceOwned } = {}) {
  if (typeof fetchInvoiceOwned !== 'function') {
    throw new Error('fetchInvoiceOwned is required');
  }
  const invoiceId = req.params?.invoiceId;
  if (!invoiceId) {
    const err = new Error('Invalid invoice id');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const row = await fetchInvoiceOwned({ invoiceId, userId: req.user.id });
  if (!row) throwNotFoundUnauthorized('Invoice not found');
  return row;
}

module.exports = {
  getRoleFlags,
  requireOwnedBooking,
  requireOwnedPayment,
  requireOwnedTrip,
  requireOwnedInvoice,
};


'use strict';

const fs = require('fs');
const path = require('path');

describe('[M-2] Rate Limit Middleware Wiring Audit', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '../../routes/index.js'),
    'utf8'
  );

  test('POST /payment/verify MUST use verifyPaymentLimiter', () => {
    expect(routeSource).toMatch(/\/payment\/verify[\s\S]*verifyPaymentLimiter/);
  });

  test('POST /bookings/:bookingId/cancel MUST use bookingLimiter', () => {
    expect(routeSource).toMatch(/bookings\/:bookingId\/cancel[\s\S]*bookingLimiter/);
  });

  test('GET /admin/bookings MUST use adminLimiter', () => {
    expect(routeSource).toMatch(/\/admin\/bookings[\s\S]*adminLimiter/);
  });

  test('POST /admin/payments/:paymentId/reconcile MUST use adminLimiter', () => {
    expect(routeSource).toMatch(/\/admin\/payments\/:paymentId\/reconcile[\s\S]*adminLimiter/);
  });
});

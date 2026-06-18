// ============================================================
// lib/sms.ts — SMS provider abstraction
// Supports: 'mock' (dev logs to console), 'twilio' (prod)
// ============================================================

import { getEnv } from './env';
import { randomInt } from 'crypto';
import { logger } from './logger';

function generateOTP(): string {
  // cryptographically secure 6-digit OTP
  return randomInt(100000, 1000000).toString().padStart(6, '0');
}

export async function sendOTP(phone: string): Promise<{ otp: string; success: boolean }> {
  const { SMS_PROVIDER, NODE_ENV } = getEnv();
  const otp = generateOTP();
  const isDev = NODE_ENV !== 'production';
  const maskedPhone = `+91${'*'.repeat(Math.max(phone.length - 2, 0))}${phone.slice(-2)}`;
  const maskedOtp = `${otp.slice(0, 1)}${'*'.repeat(otp.length - 1)}`;

  if (SMS_PROVIDER === 'mock' || NODE_ENV === 'development') {
    // Development only: log a masked OTP to the server console.
    // Never log the real OTP value, even in mock/dev mode.
    if (isDev) {
      // Structured log for development — never logs the real OTP
      logger.info({ action: 'otp_mock_send', phone: maskedPhone }, 'SMS mock OTP sent');
    }
    return { otp, success: true };
  }

  // Twilio production path
  const {
    TWILIO_ACCOUNT_SID: accountSid,
    TWILIO_AUTH_TOKEN: authToken,
    TWILIO_PHONE_NUMBER: from,
  } = getEnv();

  const body = `Your PlanBuddy OTP is: ${otp}. Valid for 5 minutes. Do not share with anyone.`;
  const to   = `+91${phone}`;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from!, To: to, Body: body }),
    }
  );

  if (!res.ok) {
    // Log only status info — never the response body, which may echo
    // back the message contents (including the OTP) or the recipient number.
    console.error(`[SMS Twilio] Failed to send to ${maskedPhone}: HTTP ${res.status}`);
    return { otp, success: false };
  }

  return { otp, success: true };
}

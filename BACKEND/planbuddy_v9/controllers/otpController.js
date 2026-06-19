'use strict';

const { sendOTP } = require('../services/smsService');
const { storeOTP, verifyOTP } = require('../services/otpService');
const db = require('../config/db');
const RefreshTokenService = require('../services/refreshTokenService');
const { generateToken } = require('../utils/jwt');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');

exports.sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') return res.status(400).json({ success: false, message: 'phone is required' });

    const { otp, success } = await sendOTP(phone);
    if (!success) return res.status(502).json({ success: false, message: 'Failed to send OTP' });

    await storeOTP(phone, otp, { ipAddress: req.ip, deviceId: req.get('x-device-id') || null });
    logger.info('OTP sent', { phone: phone.slice(0, 4) + '****' });
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) { next(err); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'phone and otp are required' });

    const result = await verifyOTP(phone, otp);
    if (!result.valid) {
      if (result.expired) return res.status(401).json({ success: false, message: 'OTP expired' });
      if (result.locked) return res.status(429).json({ success: false, message: 'Too many attempts' });
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }

    // create or get user by phone in backend DB
    const userRes = await db.query('SELECT id, phone FROM users WHERE phone = $1', [phone]);
    let user;
    if (userRes.rows.length === 0) {
      const insert = await db.query('INSERT INTO users (phone, created_at) VALUES ($1, NOW()) RETURNING id, phone', [phone]);
      user = insert.rows[0];
    } else {
      user = userRes.rows[0];
    }

    // create refresh token (Redis-backed) and access token
    const refresh = await RefreshTokenService.createRefreshToken(user.id, redis, { ip: req.ip, userAgent: req.get('User-Agent') || null });
    const { token } = generateToken({ id: user.id, role: 'user' });

    res.json({ success: true, data: { user: { id: user.id, phone: user.phone }, accessToken: token, refreshToken: refresh.refreshToken, expiresIn: process.env.JWT_EXPIRY || '15m', refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRY || '30d' } });
  } catch (err) { next(err); }
};

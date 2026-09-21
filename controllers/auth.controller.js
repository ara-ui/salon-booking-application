const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Staff } = require('../models');
const { signToken } = require('../utils/jwt');
const { AppError } = require('../middleware/error.middleware');
const { generateResetToken, hashResetToken } = require('../utils/resetToken');
const { sendPasswordResetEmail } = require('../utils/email');
const { cleanString, isValidEmail } = require('../utils/validation');

async function register(req, res) {
  const { name, email, password, phone } = req.body;
  const cleanName = cleanString(name, 120);
  const normalizedEmail = cleanString(email, 254).toLowerCase();

  if (!cleanName || !normalizedEmail || !password) {
    throw new AppError(400, 'name, email and password are required');
  }
  if (cleanName.length < 2) throw new AppError(400, 'Name must be at least 2 characters');
  if (!isValidEmail(normalizedEmail)) throw new AppError(400, 'Please provide a valid email address');
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new AppError(400, 'Password must be between 6 and 128 characters');
  }

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: cleanName,
    email: normalizedEmail,
    passwordHash,
    phone: cleanString(phone, 40) || null,
    role: 'customer',
  });

  const token = signToken(user);
  res.status(201).json({
    token,//allows automatic login after successful registration
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

async function login(req, res) {
  const email = cleanString(req.body.email, 254).toLowerCase();
  const { password } = req.body;
  if (!email || !password) throw new AppError(400, 'email and password are required');
  if (!isValidEmail(email)) throw new AppError(400, 'Please provide a valid email address');

  const user = await User.findOne({ where: { email } });
  if (!user) throw new AppError(401, 'Invalid email or password');

  if (!user.isActive) throw new AppError(403, 'This account has been deactivated');

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new AppError(401, 'Invalid email or password');

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

async function forgotPassword(req, res) {
  const email = cleanString(req.body.email, 254).toLowerCase();
  if (!email) throw new AppError(400, 'email is required');
  if (!isValidEmail(email)) throw new AppError(400, 'Please provide a valid email address');

  // Same response whether or not the account exists, and whether or not it's
  // active — otherwise this endpoint could be used to check which emails are
  // registered ("email enumeration").
  const genericResponse = {
    message: 'If an account exists with that email, a password reset link has been sent.',
  };

  const user = await User.findOne({ where: { email } });
  if (!user || !user.isActive) {
    return res.json(genericResponse);
  }

  const { token, tokenHash, expiresAt } = generateResetToken();
  user.resetPasswordTokenHash = tokenHash;
  user.resetPasswordExpires = expiresAt;
  await user.save();

  const resetUrl = `${process.env.CLIENT_URL}/html/reset-password.html?token=${token}`;
  await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

  res.json(genericResponse);
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) {
    throw new AppError(400, 'token and password are required');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new AppError(400, 'Password must be between 6 and 128 characters');
  }

  const user = await User.findOne({
    where: {
      resetPasswordTokenHash: hashResetToken(token),
      resetPasswordExpires: { [Op.gt]: new Date() }, // rejects missing/expired tokens in one query
    },
  });

  if (!user) {
    throw new AppError(400, 'That reset link is invalid or has expired');
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordChangedAt = new Date();
  // Single-use: clear the token immediately so the same link can't be replayed.
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpires = null;
  await user.save();

  res.json({ message: 'Your password has been reset. You can now log in.' });
}


async function validateResetToken(req, res) {
  const { token } = req.query;
  if (!token) {
    throw new AppError(400, 'Reset token is required');
  }

  const user = await User.findOne({
    where: {
      resetPasswordTokenHash: hashResetToken(token),
      resetPasswordExpires: { [Op.gt]: new Date() },
    },
    attributes: ['id'], // existence check only — never leak user details
  });

  if (!user) {
    throw new AppError(400, 'That reset link is invalid or has expired');
  }

  res.json({ valid: true });
}

module.exports = { register, login, forgotPassword, resetPassword, validateResetToken };
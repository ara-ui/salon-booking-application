const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Staff } = require('../models');
const { signToken } = require('../utils/jwt');
const { AppError } = require('../middleware/error.middleware');
const { generateResetToken, hashResetToken } = require('../utils/resetToken');
const { sendPasswordResetEmail } = require('../utils/email');

async function register(req, res) {
  const { name, email, password, phone, role } = req.body;

  if (!name || !email || !password) {
    throw new AppError(400, 'name, email and password are required');
  }

  // Only allow self-registration as a customer. Staff and admin accounts are
  // created by an admin via POST /staff and PUT /users/:id — never through
  // this public endpoint, otherwise anyone could register as admin.
  const existing = await User.findOne({ where: { email } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    phone,
    role: 'customer',
  });

  const token = signToken(user);
  res.status(201).json({
    token,//allows automatic login after successful registration
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError(400, 'email and password are required');

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
  const { email } = req.body;
  if (!email) throw new AppError(400, 'email is required');

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
  if (password.length < 6) {
    throw new AppError(400, 'Password must be at least 6 characters');
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
  // Single-use: clear the token immediately so the same link can't be replayed.
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpires = null;
  await user.save();

  res.json({ message: 'Your password has been reset. You can now log in.' });
}

// Lets the reset-password page check a token BEFORE showing the form, so an
// expired/used/invalid link doesn't lead the user through filling it out
// only to fail on submit. Deliberately mirrors the same
// hash + not-expired lookup used by resetPassword, but never touches or
// reveals the token/user — it only ever returns a plain success/failure.
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
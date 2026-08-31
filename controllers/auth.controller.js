const bcrypt = require('bcryptjs');
const { User, Staff } = require('../models');
const { signToken } = require('../utils/jwt');
const { AppError } = require('../middleware/error.middleware');

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

module.exports = { register, login };

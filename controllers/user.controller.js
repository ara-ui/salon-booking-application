const { User } = require('../models');
const { AppError } = require('../middleware/error.middleware');

async function getMe(req, res) {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['passwordHash'] },
  });
  res.json(user);
}

async function updateMe(req, res) {
  const { name, phone } = req.body; // deliberately not email/role — those need separate, guarded flows
  const user = await User.findByPk(req.user.id);
  if (!user) throw new AppError(404, 'User not found');

  if (name) user.name = name;
  if (phone) user.phone = phone;
  await user.save();

  res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });
}

// ---- Admin only ----

async function listUsers(req, res) {
  const { role } = req.query;
  const where = role ? { role } : {};
  const users = await User.findAll({ where, attributes: { exclude: ['passwordHash'] } });
  res.json(users);
}

async function setUserActive(req, res) {
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') throw new AppError(400, 'isActive (boolean) is required');

  const user = await User.findByPk(id);
  if (!user) throw new AppError(404, 'User not found');

  user.isActive = isActive;
  await user.save();
  res.json({ id: user.id, isActive: user.isActive });
}

module.exports = { getMe, updateMe, listUsers, setUserActive };

const bcrypt = require('bcryptjs');
const { User, Staff } = require('../models');
const { AppError } = require('../middleware/error.middleware');

async function getMe(req, res) {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['passwordHash'] },
    include: [{ model: Staff, as: 'preferredStaff', attributes: ['id'], include: [{ model: User, attributes: ['name'] }] }],
  });
  res.json(user);
}

async function updateMe(req, res) {
  // Deliberately not email/role here — those need separate, guarded flows.
  const { name, phone, preferredStaffId, reminderOptIn, preferenceNotes } = req.body;
  const user = await User.findByPk(req.user.id);
  if (!user) throw new AppError(404, 'User not found');

  if (name) user.name = name;
  if (phone) user.phone = phone;

  if (preferredStaffId !== undefined) {
    if (preferredStaffId === null) {
      user.preferredStaffId = null; // explicit "clear my preference"
    } else {
      const staff = await Staff.findByPk(preferredStaffId);
      if (!staff) throw new AppError(404, 'No such staff member to set as preferred');
      user.preferredStaffId = preferredStaffId;
    }
  }
  if (reminderOptIn !== undefined) {
    if (typeof reminderOptIn !== 'boolean') throw new AppError(400, 'reminderOptIn must be true or false');
    user.reminderOptIn = reminderOptIn;
  }
  if (preferenceNotes !== undefined) user.preferenceNotes = preferenceNotes;

  await user.save();

  res.json({
    id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role,
    preferredStaffId: user.preferredStaffId, reminderOptIn: user.reminderOptIn, preferenceNotes: user.preferenceNotes,
  });
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

  if (typeof isActive !== 'boolean') {
    throw new AppError(400, 'isActive (boolean) is required');
  }

  const user = await User.findByPk(id);
  if (!user) throw new AppError(404, 'User not found');

  if (isActive === false) {
    // Admin cannot deactivate their own account.
    if (Number(id) === req.user.id) {
      throw new AppError(400, 'You cannot deactivate your own account');
    }

    // An admin can deactivate another admin,
    // but never the last active admin.
    if (user.role === 'admin') {
      const activeAdminCount = await User.count({
        where: {
          role: 'admin',
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new AppError(
          400,
          'Cannot deactivate the last active admin'
        );
      }
    }
  }

  user.isActive = isActive;
  await user.save();

  res.json({
    id: user.id,
    isActive: user.isActive,
  });
}

async function createAdmin(req, res) {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError(400, 'name, email and password are required');
  }

  const existing = await User.findOne({ where: { email } });

  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await User.create({
    name,
    email,
    passwordHash,
    role: 'admin',
    isActive: true,
  });

  res.status(201).json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
  });
}
module.exports = {
   getMe,
   updateMe,
   listUsers,
   setUserActive,
   createAdmin };

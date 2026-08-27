const bcrypt = require('bcryptjs');
const { Staff, User, Service } = require('../models');
const { AppError } = require('../middleware/error.middleware');

async function listStaff(req, res) {
  const staff = await Staff.findAll({
    include: [
      { model: User, attributes: ['id', 'name', 'email'] },
      { model: Service, through: { attributes: [] } },
    ],
  });
  res.json(staff);
}

async function getStaff(req, res) {
  const staff = await Staff.findByPk(req.params.id, {
    include: [
      { model: User, attributes: ['id', 'name', 'email'] },
      { model: Service, through: { attributes: [] } },
    ],
  });
  if (!staff) throw new AppError(404, 'Staff member not found');
  res.json(staff);
}

// Admin creates a brand-new staff member: makes the User account (role=staff)
// and the Staff profile together in one call.
async function createStaff(req, res) {
  const { name, email, password, specialization, bio, workingHours } = req.body;
  if (!name || !email || !password) {
    throw new AppError(400, 'name, email and password are required to create a staff account');
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role: 'staff' });
  const staff = await Staff.create({ userId: user.id, specialization, bio, workingHours });

  res.status(201).json({ staffId: staff.id, userId: user.id, name: user.name, email: user.email });
}

async function updateStaff(req, res) {
  const staff = await Staff.findByPk(req.params.id);
  if (!staff) throw new AppError(404, 'Staff member not found');

  const { specialization, bio, workingHours } = req.body;
  if (specialization !== undefined) staff.specialization = specialization;
  if (bio !== undefined) staff.bio = bio;
  if (workingHours !== undefined) staff.workingHours = workingHours;
  await staff.save();

  res.json(staff);
}

// Assign one or more services to a staff member: body = { serviceIds: [1,2,3] }
async function assignServices(req, res) {
  const staff = await Staff.findByPk(req.params.id);
  if (!staff) throw new AppError(404, 'Staff member not found');

  const { serviceIds } = req.body;
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new AppError(400, 'serviceIds must be a non-empty array');
  }

  const services = await Service.findAll({ where: { id: serviceIds } });
  if (services.length !== serviceIds.length) {
    throw new AppError(404, 'One or more serviceIds do not exist');
  }

  await staff.addServices(services); // additive — doesn't remove existing assignments
  const updated = await Staff.findByPk(staff.id, { include: [Service] });
  res.json(updated);
}

module.exports = { listStaff, getStaff, createStaff, updateStaff, assignServices };

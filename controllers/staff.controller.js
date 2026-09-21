const bcrypt = require('bcryptjs');
const { Staff, User, Service } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { cleanString, isValidEmail, validateHoursObject } = require('../utils/validation');

const staffInclude = [
  { model: User, attributes: ['id', 'name', 'email', 'isActive'] },
  { model: Service, through: { attributes: [] } },
];


const publicUserAttributes = ['id', 'name', 'isActive'];

async function listStaff(req, res) {
  const staff = await Staff.findAll({
    include: [{ model: User, where: { isActive: true }, attributes: publicUserAttributes }, { model: Service, where: { isActive: true }, through: { attributes: [] }, required: false }],
    order: [[User, 'name', 'ASC']],
  });
  res.json(staff);
}

async function listAllStaff(req, res) {
  const staff = await Staff.findAll({
    include: staffInclude,
    order: [[User, 'name', 'ASC']],
  });
  res.json(staff);
}

async function getStaff(req, res) {
  const staff = await Staff.findByPk(req.params.id, {
    include: [
      { model: User, attributes: publicUserAttributes },
      { model: Service, through: { attributes: [] } },
    ],
  });
  if (!staff || (!staff.User?.isActive && req.user?.role !== 'admin')) {
    throw new AppError(404, 'Staff member not found');
  }
  res.json(staff);
}

async function createStaff(req, res) {
  const { name, email, password, specialization, bio, workingHours } = req.body;
  const cleanName = cleanString(name, 120);
  const normalizedEmail = cleanString(email, 254).toLowerCase();

  if (!cleanName || !normalizedEmail || !password) {
    throw new AppError(400, 'name, email and password are required to create a staff account');
  }
  if (cleanName.length < 2) throw new AppError(400, 'Name must be at least 2 characters');
  if (!isValidEmail(normalizedEmail)) throw new AppError(400, 'Please provide a valid email address');
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new AppError(400, 'Password must be between 6 and 128 characters');
  }

  if (workingHours !== undefined) {
    const hoursError = validateHoursObject(workingHours);
    if (hoursError) throw new AppError(400, hoursError);
  }

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: cleanName,
    email: normalizedEmail,
    passwordHash,
    role: 'staff',
    isActive: true,
  });

  try {
    const staff = await Staff.create({
      userId: user.id,
      specialization: cleanString(specialization, 160) || null,
      bio: cleanString(bio, 2000) || null,
      workingHours,
    });

    res.status(201).json({ staffId: staff.id, userId: user.id, name: user.name, email: user.email });
  } catch (err) {
    await user.destroy();
    throw err;
  }
}

async function updateStaff(req, res) {
  const staff = await Staff.findByPk(req.params.id);
  if (!staff) throw new AppError(404, 'Staff member not found');

  const { specialization, bio, workingHours } = req.body;
  if (specialization !== undefined) staff.specialization = cleanString(specialization, 160) || null;
  if (bio !== undefined) staff.bio = cleanString(bio, 2000) || null;
  if (workingHours !== undefined) {
    const hoursError = validateHoursObject(workingHours);
    if (hoursError) throw new AppError(400, hoursError);
    staff.workingHours = workingHours;
  }
  await staff.save();

  res.json(staff);
}

async function assignServices(req, res) {
  const staff = await Staff.findByPk(req.params.id);
  if (!staff) throw new AppError(404, 'Staff member not found');

  const { serviceIds } = req.body;
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || serviceIds.some(id => !Number.isInteger(Number(id)))) {
    throw new AppError(400, 'serviceIds must be a non-empty array of valid IDs');
  }

  const ids = [...new Set(serviceIds.map(Number))];
  const services = await Service.findAll({ where: { id: ids } });
  if (services.length !== ids.length) throw new AppError(404, 'One or more serviceIds do not exist');

  await staff.addServices(services);
  const updated = await Staff.findByPk(staff.id, { include: staffInclude });
  res.json(updated);
}

module.exports = { listStaff, listAllStaff, getStaff, createStaff, updateStaff, assignServices };

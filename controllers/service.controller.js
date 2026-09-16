const { Service, SalonSettings } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const {
  cleanString,
  validateServiceInput,
  validateHoursObject,
  validateSpecialDates,
} = require('../utils/validation');

async function listServices(req, res) {
  const services = await Service.findAll({
    where: { isActive: true },
    order: [['name', 'ASC']],
  });
  res.json(services);
}

async function listAllServices(req, res) {
  const services = await Service.findAll({ order: [['name', 'ASC']] });
  res.json(services);
}

async function getService(req, res) {
  const service = await Service.findByPk(req.params.id);
  if (!service || (!service.isActive && req.user?.role !== 'admin')) {
    throw new AppError(404, 'Service not found');
  }
  res.json(service);
}

async function createService(req, res) {
  const { name, description, durationMinutes, price } = req.body;
  const validationError = validateServiceInput({ name, description, durationMinutes, price });
  if (validationError) throw new AppError(400, validationError);

  const service = await Service.create({
    name: cleanString(name, 120),
    description: description === undefined ? null : cleanString(description, 2000),
    durationMinutes: Number(durationMinutes),
    price: Number(price),
  });
  res.status(201).json(service);
}

async function updateService(req, res) {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw new AppError(404, 'Service not found');

  const { name, description, durationMinutes, price, isActive } = req.body;
  const validationError = validateServiceInput(
    { name, description, durationMinutes, price },
    { partial: true }
  );
  if (validationError) throw new AppError(400, validationError);

  if (name !== undefined) service.name = cleanString(name, 120);
  if (description !== undefined) service.description = cleanString(description, 2000);
  if (durationMinutes !== undefined) service.durationMinutes = Number(durationMinutes);
  if (price !== undefined) service.price = Number(price);
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') throw new AppError(400, 'isActive must be true or false');
    service.isActive = isActive;
  }
  await service.save();

  res.json(service);
}

async function deleteService(req, res) {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw new AppError(404, 'Service not found');
  service.isActive = false;
  await service.save();
  res.json({ message: 'Service deactivated' });
}

async function getSalonSettings(req, res) {
  const settings = await SalonSettings.findByPk(1);
  if (!settings) throw new AppError(404, 'Salon settings have not been configured yet');
  res.json({ ...settings.toJSON(), specialDates: settings.specialDates || [] });
}

async function updateSalonSettings(req, res) {
  const { workingHours, specialDates } = req.body;
  if (!workingHours) throw new AppError(400, 'workingHours is required');

  const hoursError = validateHoursObject(workingHours);
  if (hoursError) throw new AppError(400, hoursError);

  const specialDatesError = validateSpecialDates(specialDates);
  if (specialDatesError) throw new AppError(400, specialDatesError);

  const [settings] = await SalonSettings.findOrCreate({
    where: { id: 1 },
    defaults: { workingHours, specialDates: specialDates || [] },
  });
  settings.workingHours = workingHours;
  if (specialDates !== undefined) settings.specialDates = specialDates;
  await settings.save();

  res.json({ ...settings.toJSON(), specialDates: settings.specialDates || [] });
}

module.exports = {
  listServices,
  listAllServices,
  getService,
  createService,
  updateService,
  deleteService,
  getSalonSettings,
  updateSalonSettings,
};

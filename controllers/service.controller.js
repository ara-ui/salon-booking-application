const { Service, SalonSettings } = require('../models');
const { AppError } = require('../middleware/error.middleware');

async function listServices(req, res) {
  const services = await Service.findAll({ where: { isActive: true } });
  res.json(services);
}

async function getService(req, res) {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw new AppError(404, 'Service not found');
  res.json(service);
}

async function createService(req, res) {
  const { name, description, durationMinutes, price } = req.body;
  if (!name || !durationMinutes || price === undefined) {
    throw new AppError(400, 'name, durationMinutes and price are required');
  }
  const service = await Service.create({ name, description, durationMinutes, price });
  res.status(201).json(service);
}

async function updateService(req, res) {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw new AppError(404, 'Service not found');

  const { name, description, durationMinutes, price, isActive } = req.body;
  if (name !== undefined) service.name = name;
  if (description !== undefined) service.description = description;
  if (durationMinutes !== undefined) service.durationMinutes = durationMinutes;
  if (price !== undefined) service.price = price;
  if (isActive !== undefined) service.isActive = isActive;
  await service.save();

  res.json(service);
}

async function deleteService(req, res) {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw new AppError(404, 'Service not found');
  // Soft delete — keeps historical appointments/reviews referencing it intact.
  service.isActive = false;
  await service.save();
  res.json({ message: 'Service deactivated' });
}

// ---- Salon settings (single row, id=1) ----

async function getSalonSettings(req, res) {
  const settings = await SalonSettings.findByPk(1);
  if (!settings) throw new AppError(404, 'Salon settings have not been configured yet');
  // Normalize null -> [] so the frontend never has to special-case a missing value.
  res.json({ ...settings.toJSON(), specialDates: settings.specialDates || [] });
}

async function updateSalonSettings(req, res) {
  const { workingHours, specialDates } = req.body;
  if (!workingHours) throw new AppError(400, 'workingHours is required');
  if (specialDates !== undefined && !Array.isArray(specialDates)) {
    throw new AppError(400, 'specialDates must be an array');
  }

  const [settings] = await SalonSettings.findOrCreate({
    where: { id: 1 },
    defaults: { workingHours, specialDates: specialDates || [] },
  });
  settings.workingHours = workingHours;
  if (specialDates !== undefined) settings.specialDates = specialDates; // leave untouched if omitted
  await settings.save();

  res.json({ ...settings.toJSON(), specialDates: settings.specialDates || [] });
}

module.exports = {
  listServices,
  getService,
  createService,
  updateService,
  deleteService,
  getSalonSettings,
  updateSalonSettings,
};

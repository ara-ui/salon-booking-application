const { Op } = require('sequelize');

const {
  Service,
  Staff,
  Appointment,
  SalonSettings,
} = require('../../models');

const { AppError } = require('../../middleware/error.middleware');

const {
  dayKeyFromDate,
  getAvailableSlots,
  resolveSalonHoursForDate,
} = require('../../utils/availability');


async function getAssignedStaff(serviceId) {
  return Staff.findAll({
    include: [{
      association: Staff.associations.Services,
      where: { id: serviceId },
      attributes: [],
    }],
  });
}


async function getBookings(staffId, date, excludeAppointmentId) {
  const where = {
    staffId,
    date,
    status: {
      [Op.in]: ['booked', 'rescheduled'],
    },
  };

  if (excludeAppointmentId) {
    where.id = { [Op.ne]: excludeAppointmentId };
  }

  return Appointment.findAll({
    where,
    attributes: ['startTime', 'endTime'],
  });
}


async function getAvailableSlotsHandler(req, res) {
  const { serviceId, staffId, date, excludeAppointmentId } = req.query;

  if (!serviceId || !date) {
    throw new AppError(400, 'serviceId and date query params are required');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, 'date must be in YYYY-MM-DD format');
  }

  const service = await Service.findByPk(serviceId);

  if (!service) {
    throw new AppError(404, 'Service not found');
  }

  const salonSettings = await SalonSettings.findByPk(1);

  if (!salonSettings) {
    throw new AppError(404, 'Salon working hours have not been configured yet');
  }

  const dayKey = dayKeyFromDate(date);

  const salonHours = resolveSalonHoursForDate({
    workingHours: salonSettings.workingHours,
    specialDates: salonSettings.specialDates,
    date,
    dayKey,
  });

  let staffList;

  if (staffId) {
    const staff = await Staff.findByPk(staffId);

    if (!staff) {
      throw new AppError(404, 'Staff member not found');
    }

    staffList = [staff];
  } else {
    staffList = await getAssignedStaff(serviceId);

    if (!staffList.length) {
      return res.json({
        date,
        serviceId: Number(serviceId),
        slots: [],
        noStaffAssigned: true,
      });
    }
  }

  const slotMap = new Map();

  for (const staff of staffList) {
    const existingBookings = await getBookings(
      staff.id,
      date,
      excludeAppointmentId
    );

    const slots = getAvailableSlots({
      salonHours,
      staffHours: staff.workingHours?.[dayKey] || [],
      durationMinutes: service.durationMinutes,
      existingBookings: existingBookings.map(b => b.toJSON()),
    });

    slots.forEach(slot => slotMap.set(slot.startTime, slot));
  }

  const slots = [...slotMap.values()]
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const response = {
    date,
    serviceId: Number(serviceId),
    slots,
  };

  if (staffId) {
    response.staffId = Number(staffId);
  }

  res.json(response);
}


module.exports = {
  getAvailableSlotsHandler,
};
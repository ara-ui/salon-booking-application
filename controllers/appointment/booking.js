const {
  Service,
  Staff,
  User,
  SalonSettings,
  Appointment,
} = require('../../models');

const { sequelize } = require('../../models');
const { AppError } = require('../../middleware/error.middleware');

const {
  dayKeyFromDate,
  timeToMinutes,
  minutesToTime,
  isSlotWithinOpenHours,
  resolveSalonHoursForDate,
} = require('../../utils/availability');

const { sendBookingConfirmation } = require('../../utils/email');


async function lockStaff(staffId, transaction) {
  const staff = await Staff.findByPk(staffId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
    include: [User],
  });

  if (!staff) {
    throw new AppError(404, 'Staff member not found');
  }

  return staff;
}


async function isStaffAssignedToService(staffId, serviceId, transaction) {
  const staff = await Staff.findOne({
    where: { id: staffId },
    include: [{
      association: Staff.associations.Services,
      where: { id: serviceId },
      attributes: [],
    }],
    transaction,
  });

  return staff;
}


async function getSalonSettings(transaction) {
  const settings = await SalonSettings.findByPk(1, { transaction });

  if (!settings) {
    throw new AppError(
      400,
      'Salon working hours have not been configured yet'
    );
  }

  return settings;
}


function isWithinWorkingHours({
  date,
  startTime,
  endTime,
  staff,
  salonSettings,
}) {
  const dayKey = dayKeyFromDate(date);

  const salonHours = resolveSalonHoursForDate({
    workingHours: salonSettings.workingHours,
    specialDates: salonSettings.specialDates,
    date,
    dayKey,
  });

  return isSlotWithinOpenHours({
    salonHours,
    staffHours: staff.workingHours?.[dayKey] || [],
    startTime,
    endTime,
  });
}


async function hasConflict({
  staffId,
  date,
  startTime,
  endTime,
  excludeAppointmentId,
  transaction,
}) {
  const appointments = await Appointment.findAll({
    where: {
      staffId,
      date,
      status: ['booked', 'rescheduled'],
    },
    transaction,
  });

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  return appointments.some(appointment => {
    if (
      excludeAppointmentId &&
      Number(appointment.id) === Number(excludeAppointmentId)
    ) {
      return false;
    }

    const existingStart = timeToMinutes(appointment.startTime);
    const existingEnd = timeToMinutes(appointment.endTime);

    return start < existingEnd && end > existingStart;
  });
}


async function findAvailableStaff({
  serviceId,
  date,
  startTime,
  endTime,
  preferredStaffId,
  transaction,
}) {
  const candidates = await Staff.findAll({
    include: [{
      association: Staff.associations.Services,
      where: { id: serviceId },
      attributes: [],
    }],
    transaction,
  });

  if (!candidates.length) {
    throw new AppError(
      400,
      'No staff is currently assigned to this service'
    );
  }

  const settings = await getSalonSettings(transaction);

  const ordered = preferredStaffId
    ? [
        ...candidates.filter(s => s.id === preferredStaffId),
        ...candidates.filter(s => s.id !== preferredStaffId),
      ]
    : candidates;

  let withinHours = false;

  for (const candidate of ordered) {
    const staff = await lockStaff(candidate.id, transaction);

    if (!isWithinWorkingHours({
      date,
      startTime,
      endTime,
      staff,
      salonSettings: settings,
    })) {
      continue;
    }

    withinHours = true;

    if (await hasConflict({
      staffId: staff.id,
      date,
      startTime,
      endTime,
      transaction,
    })) {
      continue;
    }

    return staff;
  }

  if (!withinHours) {
    throw new AppError(
      400,
      'The requested time is outside salon or staff working hours'
    );
  }

  throw new AppError(
    409,
    'That time is no longer available with any assigned staff member'
  );
}


async function bookAppointment(req, res) {
  const { serviceId, date, startTime, staffId } = req.body;

  if (!serviceId || !date || !startTime) {
    throw new AppError(
      400,
      'serviceId, date and startTime are all required'
    );
  }

  const service = await Service.findByPk(serviceId);

  if (!service) {
    throw new AppError(404, 'Service not found');
  }

  const customer = await User.findByPk(req.user.id);

  if (!customer) {
    throw new AppError(404, 'Customer not found');
  }

  const endTime = minutesToTime(
    timeToMinutes(startTime) + service.durationMinutes
  );

  const appointment = await sequelize.transaction(async transaction => {
    const settings = await getSalonSettings(transaction);

    let staff;

    if (staffId) {
      staff = await isStaffAssignedToService(
        staffId,
        serviceId,
        transaction
      );

      if (!staff) {
        throw new AppError(
          404,
          'That staff member is not assigned to this service'
        );
      }

      staff = await lockStaff(staff.id, transaction);

      if (!isWithinWorkingHours({
        date,
        startTime,
        endTime,
        staff,
        salonSettings: settings,
      })) {
        throw new AppError(
          400,
          'The requested time is outside salon or staff working hours'
        );
      }

      if (await hasConflict({
        staffId: staff.id,
        date,
        startTime,
        endTime,
        transaction,
      })) {
        throw new AppError(
          409,
          'That slot was just booked by someone else — please pick another.'
        );
      }
    } else {
      staff = await findAvailableStaff({
        serviceId,
        date,
        startTime,
        endTime,
        preferredStaffId: customer.preferredStaffId,
        transaction,
      });
    }

    return Appointment.create({
      customerId: customer.id,
      staffId: staff.id,
      serviceId,
      date,
      startTime,
      endTime,
      status: 'booked',
      paymentStatus: 'unpaid',
    }, { transaction });
  });

  const staff = await Staff.findByPk(appointment.staffId, {
    include: [User],
  });

  await sendBookingConfirmation({
    to: customer.email,
    customerName: customer.name,
    serviceName: service.name,
    staffName: staff.User.name,
    date,
    startTime,
  });

  res.status(201).json(appointment);
}

module.exports = {
  bookAppointment,
  lockStaff,
  getSalonSettings,
  isWithinWorkingHours,
  hasConflict,
};
const {
  Appointment,
  Service,
  Staff,
  User,
} = require('../../models');

const { sequelize } = require('../../models');
const { AppError } = require('../../middleware/error.middleware');

const {
  timeToMinutes,
  minutesToTime,
} = require('../../utils/availability');

const { hoursUntil } = require('../../utils/datetime');
const { sendCancellationNotice } = require('../../utils/email');
const { maybeGenerateInvoice } = require('../../utils/invoiceService');

const {
  lockStaff,
  getSalonSettings,
  isWithinWorkingHours,
  hasConflict,
} = require('./booking');

const CHANGE_WINDOW_HOURS = 24;
const MAX_RESCHEDULES = 2;


// GET SINGLE APPOINTMENT

async function getAppointmentById(req, res) {
  const appointment = await Appointment.findByPk(req.params.id, {
    include: [
      {
        model: User,
        as: 'customer',
        attributes: ['id', 'name', 'email', 'phone'],
      },
      {
        model: Staff,
        include: [{
          model: User,
          attributes: ['id', 'name', 'email'],
        }],
      },
      { model: Service },
    ],
  });

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  const allowed =
    (req.user.role === 'customer' &&
      appointment.customerId === req.user.id) ||
    (req.user.role === 'staff' &&
      appointment.staffId === req.user.staffId) ||
    req.user.role === 'admin';

  if (!allowed) {
    throw new AppError(
      403,
      'You do not have permission to view this appointment'
    );
  }

  res.json(appointment);
}


// CUSTOMER APPOINTMENTS

async function getMyAppointments(req, res) {
  const appointments = await Appointment.findAll({
    where: {
      customerId: req.user.id,
    },
    include: [
      { model: Staff, include: [User] },
      { model: Service },
    ],
    order: [
      ['date', 'DESC'],
      ['startTime', 'DESC'],
    ],
  });

  res.json(appointments);
}


// STAFF APPOINTMENTS

async function getStaffAppointments(req, res) {
  if (!req.user.staffId) {
    throw new AppError(
      404,
      'No staff profile linked to this account'
    );
  }

  const appointments = await Appointment.findAll({
    where: {
      staffId: req.user.staffId,
    },
    include: [
      {
        model: User,
        as: 'customer',
        attributes: ['id', 'name', 'email', 'phone'],
      },
      { model: Service },
    ],
    order: [
      ['date', 'ASC'],
      ['startTime', 'ASC'],
    ],
  });

  res.json(appointments);
}


// ADMIN — ALL APPOINTMENTS

async function getAllAppointments(req, res) {
  const { status, date } = req.query;

  const where = {};

  if (status) where.status = status;
  if (date) where.date = date;

  const appointments = await Appointment.findAll({
    where,
    include: [
      {
        model: User,
        as: 'customer',
        attributes: ['id', 'name', 'email'],
      },
      {
        model: Staff,
        include: [User],
      },
      { model: Service },
    ],
    order: [
      ['date', 'DESC'],
      ['startTime', 'DESC'],
    ],
  });

  res.json(appointments);
}


// RESCHEDULE

async function rescheduleAppointment(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  const isCustomerOwner =
    req.user.role === 'customer' &&
    appointment.customerId === req.user.id;

  if (!isCustomerOwner && req.user.role !== 'admin') {
    throw new AppError(
      403,
      'You do not have permission to reschedule this appointment'
    );
  }

  if (['cancelled', 'completed'].includes(appointment.status)) {
    throw new AppError(
      400,
      `Cannot reschedule a ${appointment.status} appointment`
    );
  }

  // Customer policy: must reschedule at least 24 hours before
  // the existing appointment.
  if (
    req.user.role === 'customer' &&
    hoursUntil(
      appointment.date,
      appointment.startTime
    ) < CHANGE_WINDOW_HOURS
  ) {
    throw new AppError(
      400,
      `Appointments can't be rescheduled within ${CHANGE_WINDOW_HOURS} hours of the start time`
    );
  }

  // Customer policy: maximum number of reschedules.
  if (
    req.user.role === 'customer' &&
    appointment.rescheduleCount >= MAX_RESCHEDULES
  ) {
    throw new AppError(
      400,
      `You can reschedule an appointment a maximum of ${MAX_RESCHEDULES} times`
    );
  }

  const { date, startTime } = req.body;

  if (!date || !startTime) {
    throw new AppError(
      400,
      'date and startTime are required'
    );
  }

  const service = await Service.findByPk(
    appointment.serviceId
  );

  if (!service) {
    throw new AppError(404, 'Service not found');
  }

  const endTime = minutesToTime(
    timeToMinutes(startTime) +
    service.durationMinutes
  );

  await sequelize.transaction(async transaction => {
    // Lock the staff row so concurrent bookings/reschedules
    // for the same staff member cannot pass the conflict check together.
    const staff = await lockStaff(
      appointment.staffId,
      transaction
    );

    const salonSettings =
      await getSalonSettings(transaction);

    if (
      !isWithinWorkingHours({
        date,
        startTime,
        endTime,
        staff,
        salonSettings,
      })
    ) {
      throw new AppError(
        400,
        'The requested time is outside salon or staff working hours'
      );
    }

    if (
      await hasConflict({
        staffId: staff.id,
        date,
        startTime,
        endTime,
        excludeAppointmentId: appointment.id,
        transaction,
      })
    ) {
      throw new AppError(
        409,
        'That slot is already booked. Please choose another time.'
      );
    }

    appointment.date = date;
    appointment.startTime = startTime;
    appointment.endTime = endTime;
    appointment.status = 'rescheduled';
    appointment.rescheduleCount += 1;

    await appointment.save({
      transaction,
    });
  });

  res.json(appointment);
}


// CANCEL

async function cancelAppointment(req, res) {
  const appointment = await Appointment.findByPk(
    req.params.id,
    {
      include: [
        {
          model: User,
          as: 'customer',
        },
        { model: Service },
      ],
    }
  );

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  const isCustomerOwner =
    req.user.role === 'customer' &&
    appointment.customerId === req.user.id;

  if (!isCustomerOwner && req.user.role !== 'admin') {
    throw new AppError(
      403,
      'You do not have permission to cancel this appointment'
    );
  }

  if (
    appointment.status === 'cancelled' ||
    appointment.status === 'completed'
  ) {
    throw new AppError(
      400,
      `Appointment is already ${appointment.status}`
    );
  }

  // Customer cancellation policy: 24 hours before appointment.
  // Admin can cancel at any time.
  if (
    req.user.role === 'customer' &&
    hoursUntil(
      appointment.date,
      appointment.startTime
    ) < CHANGE_WINDOW_HOURS
  ) {
    throw new AppError(
      400,
      `Appointments can't be cancelled within ${CHANGE_WINDOW_HOURS} hours of the start time`
    );
  }

  appointment.status = 'cancelled';

  await appointment.save();

  await sendCancellationNotice({
    to: appointment.customer.email,
    customerName: appointment.customer.name,
    serviceName: appointment.Service.name,
    date: appointment.date,
    startTime: appointment.startTime,
  });

  res.json(appointment);
}


// UPDATE APPOINTMENT STATUS

async function updateAppointmentStatus(req, res) {
  const appointment = await Appointment.findByPk(
    req.params.id
  );

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  const isAssignedStaff =
    req.user.role === 'staff' &&
    appointment.staffId === req.user.staffId;

  if (
    !isAssignedStaff &&
    req.user.role !== 'admin'
  ) {
    throw new AppError(
      403,
      'Only the assigned staff member or an admin can update this appointment\'s status'
    );
  }

  const { status } = req.body;

  if (!['completed', 'booked'].includes(status)) {
    throw new AppError(
      400,
      "status must be 'completed' or 'booked'"
    );
  }

  appointment.status = status;

  await appointment.save();

  if (status === 'completed') {
    await maybeGenerateInvoice(appointment.id);
  }

  res.json(appointment);
}


module.exports = {
  getAppointmentById,
  getMyAppointments,
  getStaffAppointments,
  getAllAppointments,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
};
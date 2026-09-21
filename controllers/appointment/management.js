const {
  Appointment,
  Service,
  Staff,
  User,
  Review,
  Payment,
} = require('../../models');
const crypto = require('crypto');

const { sequelize } = require('../../models');
const { AppError } = require('../../middleware/error.middleware');

const {
  timeToMinutes,
  minutesToTime,
} = require('../../utils/availability');

const { hoursUntil } = require('../../utils/datetime');
const { isValidDateString, isValidTimeString, isFutureDateTime } = require('../../utils/validation');
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



async function reconcileAppointmentPaymentStatus(appointment) {
  const successfulPayment = await Payment.findOne({
    where: {
      appointmentId: appointment.id,
      status: 'succeeded',
    },
    order: [['createdAt', 'DESC']],
  });

  const expectedStatus = successfulPayment ? 'paid' : 'unpaid';

  if (appointment.paymentStatus !== expectedStatus) {
    appointment.paymentStatus = expectedStatus;
    await appointment.save();
  }

  return appointment;
}

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
      { model: Review },
    ],
  });

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  await reconcileAppointmentPaymentStatus(appointment);

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

  // Never expose the completion code through appointment list/detail responses.
  if (req.user.role === 'customer') {
    const safeAppointment = appointment.toJSON();
    delete safeAppointment.completionCode;
    delete safeAppointment.completionCodeGeneratedAt;
    delete safeAppointment.completionCodeUsedAt;
    return res.json(safeAppointment);
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
      { model: Staff, include: [{ model: User, attributes: ['id', 'name'] }] },
      { model: Service },
    ],
    order: [
      ['date', 'DESC'],
      ['startTime', 'DESC'],
    ],
  });

  await Promise.all(appointments.map(reconcileAppointmentPaymentStatus));

  const safeAppointments = appointments.map((appointment) => {
    const item = appointment.toJSON();
    delete item.completionCode;
    delete item.completionCodeGeneratedAt;
    delete item.completionCodeUsedAt;
    return item;
  });

  res.json(safeAppointments);
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

  await Promise.all(appointments.map(reconcileAppointmentPaymentStatus));

  const safeAppointments = appointments.map((appointment) => {
    const item = appointment.toJSON();
    delete item.completionCode;
    delete item.completionCodeGeneratedAt;
    delete item.completionCodeUsedAt;
    return item;
  });

  res.json(safeAppointments);
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
        include: [{ model: User, attributes: ['id', 'name'] }],
      },
      { model: Service },
    ],
    order: [
      ['date', 'DESC'],
      ['startTime', 'DESC'],
    ],
  });

  await Promise.all(appointments.map(reconcileAppointmentPaymentStatus));

  const safeAppointments = appointments.map((appointment) => {
    const item = appointment.toJSON();
    delete item.completionCode;
    delete item.completionCodeGeneratedAt;
    delete item.completionCodeUsedAt;
    return item;
  });

  res.json(safeAppointments);
}


// RESCHEDULE

async function rescheduleAppointment(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  await reconcileAppointmentPaymentStatus(appointment);

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

  if (appointment.paymentStatus === 'paid') {
    throw new AppError(400, req.user.role === 'customer'
      ? 'Paid appointments cannot be rescheduled online. Please contact the salon.'
      : 'Paid appointments should be handled through the payment/admin process before rescheduling.');
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
    throw new AppError(400, 'date and startTime are required');
  }
  if (!isValidDateString(date)) throw new AppError(400, 'date must be in YYYY-MM-DD format');
  if (!isValidTimeString(startTime)) throw new AppError(400, 'startTime must be in HH:MM format');
  if (!isFutureDateTime(date, startTime)) throw new AppError(400, 'Please choose a future date and time');

  const service = await Service.findByPk(
    appointment.serviceId
  );

  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  if (!service.isActive && req.user.role === 'customer') {
    throw new AppError(400, 'This service is no longer available for booking');
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

  await reconcileAppointmentPaymentStatus(appointment);

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

  if (req.user.role === 'customer' && appointment.paymentStatus === 'paid') {
    throw new AppError(400, 'Paid appointments cannot be cancelled online. Please contact the salon.');
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


// CUSTOMER GENERATES COMPLETION CODE

function appointmentHasEnded(appointment) {
  if (!appointment.date || !appointment.endTime) return false;
  const end = new Date(`${appointment.date}T${appointment.endTime}:00`);
  return Number.isFinite(end.getTime()) && end.getTime() <= Date.now();
}

async function generateCompletionCode(req, res) {
  const appointment = await Appointment.findByPk(req.params.id, {
    include: [{ model: Service, attributes: ['id', 'name'] }],
  });

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  await reconcileAppointmentPaymentStatus(appointment);

  if (req.user.role !== 'customer' || appointment.customerId !== req.user.id) {
    throw new AppError(403, 'Only the customer who owns this appointment can generate the completion code');
  }

  if (!['booked', 'rescheduled'].includes(appointment.status)) {
    throw new AppError(400, `Cannot generate a completion code for a ${appointment.status} appointment`);
  }

  if (appointment.paymentStatus === 'paid') {
    throw new AppError(400, 'This appointment is already marked as paid and cannot enter the post-service payment flow');
  }

  if (!appointmentHasEnded(appointment)) {
    throw new AppError(400, 'The completion code can only be generated after the appointment has finished');
  }

  const code = String(crypto.randomInt(100000, 1000000));
  appointment.completionCode = code;
  appointment.completionCodeGeneratedAt = new Date();
  appointment.completionCodeUsedAt = null;
  await appointment.save();

  res.json({
    appointmentId: appointment.id,
    code,
    serviceName: appointment.Service?.name || 'Appointment',
    generatedAt: appointment.completionCodeGeneratedAt,
  });
}


// STAFF VERIFIES CUSTOMER'S COMPLETION CODE

async function verifyCompletionCode(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  await reconcileAppointmentPaymentStatus(appointment);

  const isAssignedStaff =
    req.user.role === 'staff' &&
    appointment.staffId === req.user.staffId;

  if (!isAssignedStaff && req.user.role !== 'admin') {
    throw new AppError(403, 'Only the assigned staff member or an admin can verify the completion code');
  }

  if (!['booked', 'rescheduled'].includes(appointment.status)) {
    throw new AppError(400, `This appointment is already ${appointment.status}`);
  }

  if (appointment.paymentStatus === 'paid') {
    throw new AppError(400, 'This appointment is already marked as paid');
  }

  if (!appointment.completionCode) {
    throw new AppError(400, 'The customer has not generated a completion code yet');
  }

  if (!appointmentHasEnded(appointment)) {
    throw new AppError(400, 'This appointment has not finished yet');
  }

  const suppliedCode = String(req.body.code || '').trim();
  if (!/^\d{6}$/.test(suppliedCode)) {
    throw new AppError(400, 'Enter the 6-digit completion code');
  }

  if (suppliedCode !== appointment.completionCode) {
    throw new AppError(400, 'That completion code is incorrect');
  }

  // Completion changes service state only. It never marks payment as paid.
  const paymentStatusBeforeCompletion = appointment.paymentStatus;
  appointment.status = 'completed';
  appointment.completionCodeUsedAt = new Date();
  appointment.completionCode = null;
  appointment.paymentStatus = paymentStatusBeforeCompletion;
  await appointment.save();

  await maybeGenerateInvoice(appointment.id);

  res.json({
    appointmentId: appointment.id,
    status: appointment.status,
    paymentStatus: appointment.paymentStatus,
    message: 'Appointment completed. Payment is now available to the customer.',
  });
}


// ADMIN STATUS OVERRIDE
// Kept for admin workflows; staff completion now goes through the one-time code.

async function updateAppointmentStatus(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);

  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }

  if (req.user.role !== 'admin') {
    throw new AppError(403, 'Only an admin can directly update appointment status');
  }

  const { status } = req.body;

  if (!['completed', 'booked'].includes(status)) {
    throw new AppError(400, "status must be 'completed' or 'booked'");
  }

  if (status === 'completed' && !['booked', 'rescheduled'].includes(appointment.status)) {
    throw new AppError(400, `Cannot mark a ${appointment.status} appointment as completed`);
  }

  if (status === 'booked' && appointment.status === 'completed') {
    throw new AppError(400, 'A completed appointment cannot be reopened as booked');
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
  generateCompletionCode,
  verifyCompletionCode,
  updateAppointmentStatus,
};
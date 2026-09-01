const { Op } = require('sequelize');
const { Service, Staff, User, SalonSettings, Appointment, Invoice } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { dayKeyFromDate, getAvailableSlots, timeToMinutes, minutesToTime, isSlotWithinOpenHours, resolveSalonHoursForDate } = require('../utils/availability');
const { sendBookingConfirmation, sendCancellationNotice } = require('../utils/email');
const { hoursUntil } = require('../utils/datetime');
const { INVOICE_DIR } = require('../utils/invoicePdf');
const { maybeGenerateInvoice } = require('../utils/invoiceService');
const fs = require('fs');
const path = require('path');

const CANCELLATION_WINDOW_HOURS = 2; // no reschedule/cancel within this many hours of the appointment

async function getAvailableSlotsHandler(req, res) {
  const { serviceId, staffId, date, excludeAppointmentId } = req.query;
  if (!serviceId || !date) {
    throw new AppError(400, 'serviceId and date query params are required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, 'date must be in YYYY-MM-DD format');
  }

  const service = await Service.findByPk(serviceId);
  if (!service) throw new AppError(404, 'Service not found');

  const salonSettings = await SalonSettings.findByPk(1);
  if (!salonSettings) throw new AppError(404, 'Salon working hours have not been configured yet');

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
    if (!staff) throw new AppError(404, 'Staff member not found');
    staffList = [staff];
  } else {
    staffList = await getAssignedStaffForService(serviceId);
    if (staffList.length === 0) {
      return res.json({ date, serviceId: Number(serviceId), slots: [], noStaffAssigned: true });
    }
  }

  const slotMap = new Map();
  for (const staff of staffList) {
    const staffHours = staff.workingHours?.[dayKey] || [];
    const bookingWhere = { staffId: staff.id, date, status: ['booked', 'rescheduled'] };

    if (excludeAppointmentId) {
      bookingWhere.id = { [Op.ne]: excludeAppointmentId };
    }
    const existingBookings = await Appointment.findAll({
      where: bookingWhere,
      attributes: ['startTime', 'endTime'],
    });

    const slots = getAvailableSlots({
      salonHours,
      staffHours,
      durationMinutes: service.durationMinutes,
      existingBookings: existingBookings.map((b) => b.toJSON()),
    });
    for (const s of slots) slotMap.set(s.startTime, s);
  }

  const mergedSlots = [...slotMap.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const response = { date, serviceId: Number(serviceId), slots: mergedSlots };
  if (staffId) response.staffId = Number(staffId);
  res.json(response);
}

function isWithinWorkingHoursBool({ date, startTime, endTime, staff, salonSettings }) {
  const dayKey = dayKeyFromDate(date);
  const salonHours = resolveSalonHoursForDate({
    workingHours: salonSettings.workingHours,
    specialDates: salonSettings.specialDates,
    date,
    dayKey,
  });
  const staffHours = staff.workingHours?.[dayKey] || [];
  return isSlotWithinOpenHours({ salonHours, staffHours, startTime, endTime });
}

async function assertWithinWorkingHours({ date, startTime, endTime, staff }) {
  const salonSettings = await SalonSettings.findByPk(1);
  if (!salonSettings) throw new AppError(400, 'Salon working hours have not been configured yet');
  if (!isWithinWorkingHoursBool({ date, startTime, endTime, staff, salonSettings })) {
    throw new AppError(400, 'The requested time is outside salon or staff working hours');
  }
}

async function slotHasConflict({ staffId, date, startTime, endTime, excludeAppointmentId }) {
  const existing = await Appointment.findAll({ where: { staffId, date, status: ['booked', 'rescheduled'] } });

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  return existing.some((appt) => {
    if (excludeAppointmentId && appt.id === excludeAppointmentId) return false; // ignore the appointment being rescheduled
    const apptStart = timeToMinutes(appt.startTime);
    const apptEnd = timeToMinutes(appt.endTime);
    return startMin < apptEnd && endMin > apptStart; // overlap test
  });
}

async function assertSlotIsFree(params) {
  if (await slotHasConflict(params)) {
    throw new AppError(409, 'That slot was just booked by someone else — please pick another.');
  }
}

async function getAssignedStaffForService(serviceId) {
  return Staff.findAll({
    include: [{ model: Service, where: { id: serviceId }, attributes: [] }],
  });
}


async function pickStaffForBooking({ serviceId, date, startTime, endTime, preferredStaffId }) {
  const assignedStaff = await getAssignedStaffForService(serviceId);
  if (assignedStaff.length === 0) {
    throw new AppError(400, 'No staff is currently assigned to this service. Please choose another service or contact the salon.');
  }

  const salonSettings = await SalonSettings.findByPk(1);
  if (!salonSettings) throw new AppError(400, 'Salon working hours have not been configured yet');

  const ordered = preferredStaffId
    ? [...assignedStaff].sort((a, b) => (a.id === preferredStaffId ? -1 : b.id === preferredStaffId ? 1 : 0))
    : assignedStaff;

  let anyWithinWorkingHours = false;
  for (const staff of ordered) {
    if (!isWithinWorkingHoursBool({ date, startTime, endTime, staff, salonSettings })) continue;
    anyWithinWorkingHours = true;
    if (await slotHasConflict({ staffId: staff.id, date, startTime, endTime })) continue;
    return staff; // first workable candidate wins
  }

 
  if (!anyWithinWorkingHours) {
    throw new AppError(400, 'The requested time is outside salon or staff working hours');
  }
  throw new AppError(409, 'That time is no longer available with any assigned staff member — please pick another time.');
}

async function bookAppointment(req, res) {
  const { serviceId, date, startTime } = req.body;
  let { staffId } = req.body;
  if (!serviceId || !date || !startTime) {
    throw new AppError(400, 'serviceId, date and startTime are all required');
  }

  const service = await Service.findByPk(serviceId);
  if (!service) throw new AppError(404, 'Service not found');

  const endTime = minutesToTime(
    timeToMinutes(startTime) + service.durationMinutes
  );

  const customer = await User.findByPk(req.user.id);

  let staff;
  if (staffId) {
      staff = await Staff.findOne({
      where: { id: staffId },
      include: [{ model: Service, where: { id: serviceId }, attributes: [] }, User],
    });
    if (!staff) throw new AppError(404, 'That staff member is not assigned to this service');
    await assertWithinWorkingHours({ date, startTime, endTime, staff });
    await assertSlotIsFree({ staffId: staff.id, date, startTime, endTime });
  } else {
    const picked = await pickStaffForBooking({
      serviceId, date, startTime, endTime, preferredStaffId: customer.preferredStaffId,
    });
    staff = await Staff.findByPk(picked.id, { include: [User] });
  }

  const appointment = await Appointment.create({
    customerId: req.user.id,
    staffId: staff.id,
    serviceId,
    date,
    startTime,
    endTime,
    status: 'booked',
    paymentStatus: 'unpaid',
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

async function getAppointmentById(req, res) {
  const appointment = await Appointment.findByPk(req.params.id, {
    include: [
      { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
      { model: Staff, include: [{ model: User, attributes: ['id', 'name', 'email'] }] },
      { model: Service },
    ],
  });
  if (!appointment) throw new AppError(404, 'Appointment not found');

  const isOwner = req.user.role === 'customer' && appointment.customerId === req.user.id;
  const isAssignedStaff = req.user.role === 'staff' && appointment.staffId === req.user.staffId;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAssignedStaff && !isAdmin) {
    throw new AppError(403, 'You do not have permission to view this appointment');
  }

  res.json(appointment);
}

async function getMyAppointments(req, res) {
  const appointments = await Appointment.findAll({
    where: { customerId: req.user.id },
    include: [{ model: Staff, include: [User] }, { model: Service }],
    order: [['date', 'DESC'], ['startTime', 'DESC']],
  });
  res.json(appointments);
}

async function getStaffAppointments(req, res) {
  if (!req.user.staffId) throw new AppError(404, 'No staff profile linked to this account');
  const appointments = await Appointment.findAll({
    where: { staffId: req.user.staffId },
    include: [{ model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] }, { model: Service }],
    order: [['date', 'ASC'], ['startTime', 'ASC']],
  });
  res.json(appointments);
}

async function getAllAppointments(req, res) {
  const { status, date } = req.query;
  const where = {};
  if (status) where.status = status;
  if (date) where.date = date;

  const appointments = await Appointment.findAll({
    where,
    include: [
      { model: User, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: Staff, include: [User] },
      { model: Service },
    ],
    order: [['date', 'DESC'], ['startTime', 'DESC']],
  });
  res.json(appointments);
}

async function rescheduleAppointment(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);
  if (!appointment) throw new AppError(404, 'Appointment not found');

  const isOwner = req.user.role === 'customer' && appointment.customerId === req.user.id;
  if (!isOwner && req.user.role !== 'admin') {
    throw new AppError(403, 'You do not have permission to reschedule this appointment');
  }
  if (appointment.status === 'cancelled' || appointment.status === 'completed') {
    throw new AppError(400, `Cannot reschedule a ${appointment.status} appointment`);
  }
  if (hoursUntil(appointment.date, appointment.startTime) < CANCELLATION_WINDOW_HOURS) {
    throw new AppError(400, `Appointments can't be rescheduled within ${CANCELLATION_WINDOW_HOURS} hours of the start time`);
  }

  const { date, startTime } = req.body;
  if (!date || !startTime) throw new AppError(400, 'date and startTime are required');

  const service = await Service.findByPk(appointment.serviceId);
  const staff = await Staff.findByPk(appointment.staffId);
  const endTime = minutesToTime(
    timeToMinutes(startTime) + service.durationMinutes
  );

  await assertWithinWorkingHours({ date, startTime, endTime, staff });
  await assertSlotIsFree({ staffId: appointment.staffId, date, startTime, endTime, excludeAppointmentId: appointment.id });

  appointment.date = date;
  appointment.startTime = startTime;
  appointment.endTime = endTime;
  appointment.status = 'rescheduled';
  await appointment.save();

  res.json(appointment);
}

async function cancelAppointment(req, res) {
  const appointment = await Appointment.findByPk(req.params.id, {
    include: [{ model: User, as: 'customer' }, { model: Service }],
  });
  if (!appointment) throw new AppError(404, 'Appointment not found');

  const isOwner = req.user.role === 'customer' && appointment.customerId === req.user.id;
  if (!isOwner && req.user.role !== 'admin') {
    throw new AppError(403, 'You do not have permission to cancel this appointment');
  }
  if (appointment.status === 'cancelled' || appointment.status === 'completed') {
    throw new AppError(400, `Appointment is already ${appointment.status}`);
  }
  // Admins can force-cancel any time; customers are bound by the policy window.
  if (req.user.role === 'customer' && hoursUntil(appointment.date, appointment.startTime) < CANCELLATION_WINDOW_HOURS) {
    throw new AppError(400, `Appointments can't be cancelled within ${CANCELLATION_WINDOW_HOURS} hours of the start time`);
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

// Staff marks an appointment as completed once the service has been performed.
async function updateAppointmentStatus(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);
  if (!appointment) throw new AppError(404, 'Appointment not found');

  const isAssignedStaff = req.user.role === 'staff' && appointment.staffId === req.user.staffId;
  if (!isAssignedStaff && req.user.role !== 'admin') {
    throw new AppError(403, 'Only the assigned staff member or an admin can update this appointment\'s status');
  }

  const { status } = req.body;
  if (!['completed', 'booked'].includes(status)) {
    throw new AppError(400, "status must be 'completed' or 'booked'");
  }

  appointment.status = status;
  await appointment.save();

  if (status === 'completed') {
    await maybeGenerateInvoice(appointment.id);
  }

  res.json(appointment);
}


async function downloadInvoice(req, res) {
  const appointment = await Appointment.findByPk(req.params.id);
  if (!appointment) throw new AppError(404, 'Appointment not found');

  const isOwner = req.user.role === 'customer' && appointment.customerId === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError(403, 'You do not have permission to view this invoice');

  const invoice = await Invoice.findOne({ where: { appointmentId: appointment.id } });
  if (!invoice) throw new AppError(404, 'No invoice has been generated for this appointment yet');

  const filePath = path.join(INVOICE_DIR, `invoice-appointment-${appointment.id}.pdf`);
  if (!fs.existsSync(filePath)) throw new AppError(404, 'Invoice file not found on disk');

  res.download(filePath, `invoice-${appointment.id}.pdf`);
}

module.exports = {
  getAvailableSlotsHandler,
  bookAppointment,
  getAppointmentById,
  getMyAppointments,
  getStaffAppointments,
  getAllAppointments,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  downloadInvoice,
};
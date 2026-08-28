const { Service, Staff, User, SalonSettings, Appointment, Invoice } = require('../models');
const { AppError } = require('../middleware/error.middleware');
const { dayKeyFromDate, getAvailableSlots, timeToMinutes, minutesToTime } = require('../utils/availability');
const { sendBookingConfirmation, sendCancellationNotice } = require('../utils/email');
const { hoursUntil } = require('../utils/datetime');
const { INVOICE_DIR } = require('../utils/invoicePdf');
const fs = require('fs');
const path = require('path');

const CANCELLATION_WINDOW_HOURS = 2; // no reschedule/cancel within this many hours of the appointment

async function getAvailableSlotsHandler(req, res) {
  const { serviceId, staffId, date } = req.query;
  if (!serviceId || !staffId || !date) {
    throw new AppError(400, 'serviceId, staffId and date query params are all required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, 'date must be in YYYY-MM-DD format');
  }

  const service = await Service.findByPk(serviceId);
  if (!service) throw new AppError(404, 'Service not found');

  const staff = await Staff.findByPk(staffId);
  if (!staff) throw new AppError(404, 'Staff member not found');

  const salonSettings = await SalonSettings.findByPk(1);
  if (!salonSettings) throw new AppError(404, 'Salon working hours have not been configured yet');

  const dayKey = dayKeyFromDate(date);
  const salonHours = salonSettings.workingHours[dayKey] || [];
  const staffHours = staff.workingHours?.[dayKey] || [];

  const existingBookings = await Appointment.findAll({
    where: { staffId, date, status: ['booked', 'rescheduled'] },
    attributes: ['startTime', 'endTime'],
  });

  const slots = getAvailableSlots({
    salonHours,
    staffHours,
    durationMinutes: service.durationMinutes,
    existingBookings: existingBookings.map((b) => b.toJSON()),
  });

  res.json({ date, serviceId: Number(serviceId), staffId: Number(staffId), slots });
}

// Re-checks the requested slot is still free right before creating the
// booking — the /available-slots response can go stale between the user
// viewing it and clicking "confirm".
async function assertSlotIsFree({ staffId, date, startTime, endTime, excludeAppointmentId }) {
  const where = { staffId, date, status: ['booked', 'rescheduled'] };
  const existing = await Appointment.findAll({ where });

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  const conflict = existing.some((appt) => {
    if (excludeAppointmentId && appt.id === excludeAppointmentId) return false; // ignore the appointment being rescheduled
    const apptStart = timeToMinutes(appt.startTime);
    const apptEnd = timeToMinutes(appt.endTime);
    return startMin < apptEnd && endMin > apptStart; // overlap test
  });

  if (conflict) throw new AppError(409, 'That slot was just booked by someone else — please pick another.');
}

async function bookAppointment(req, res) {
  const { serviceId, staffId, date, startTime } = req.body;
  if (!serviceId || !staffId || !date || !startTime) {
    throw new AppError(400, 'serviceId, staffId, date and startTime are all required');
  }

  const service = await Service.findByPk(serviceId);
  if (!service) throw new AppError(404, 'Service not found');

  const staff = await Staff.findByPk(staffId, { include: [User] });
  if (!staff) throw new AppError(404, 'Staff member not found');

  const endTime = minutesToTime(
    timeToMinutes(startTime) + service.durationMinutes
  );

  await assertSlotIsFree({ staffId, date, startTime, endTime });

  const appointment = await Appointment.create({
    customerId: req.user.id,
    staffId,
    serviceId,
    date,
    startTime,
    endTime,
    status: 'booked',
    paymentStatus: 'unpaid',
  });

  const customer = await User.findByPk(req.user.id);
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

// Loads an appointment with everything a detail view needs, and enforces
// who's allowed to see it: the customer who booked it, the assigned staff
// member, or an admin.
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
  const endTime = minutesToTime(
    timeToMinutes(startTime) + service.durationMinutes
  );

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
  res.json(appointment);
}

// Streams the invoice PDF. Viewable by the customer who owns the appointment
// or an admin — same access pattern as the appointment detail view.
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

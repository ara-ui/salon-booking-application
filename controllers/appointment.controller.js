const {
  getAvailableSlotsHandler,
} = require('./appointment/availability');

const {
  bookAppointment,
} = require('./appointment/booking');

const {
  getAppointmentById,
  getMyAppointments,
  getStaffAppointments,
  getAllAppointments,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
} = require('./appointment/management');

const {
  downloadInvoice,
} = require('./appointment/invoice');


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
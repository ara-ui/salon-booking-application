const sequelize = require('../config/database');

const User = require('./user.model')(sequelize);
const Staff = require('./staff.model')(sequelize);
const Service = require('./service.model')(sequelize);
const StaffService = require('./staffService.model')(sequelize);
const SalonSettings = require('./salonSettings.model')(sequelize);
const Appointment = require('./appointment.model')(sequelize);
const Review = require('./review.model')(sequelize);
const Payment = require('./payment.model')(sequelize);
const Invoice = require('./invoice.model')(sequelize);

// ---- Associations ----

// A User can have one Staff profile (only relevant when role === 'staff')
User.hasOne(Staff, { foreignKey: 'userId', onDelete: 'CASCADE' });
Staff.belongsTo(User, { foreignKey: 'userId' });

// Staff <-> Service (many-to-many)
Staff.belongsToMany(Service, { through: StaffService, foreignKey: 'staffId', otherKey: 'serviceId' });
Service.belongsToMany(Staff, { through: StaffService, foreignKey: 'serviceId', otherKey: 'staffId' });

// Appointment belongs to a customer (User), a Staff, and a Service
User.hasMany(Appointment, { foreignKey: 'customerId', as: 'customerAppointments' });
Appointment.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

Staff.hasMany(Appointment, { foreignKey: 'staffId' });
Appointment.belongsTo(Staff, { foreignKey: 'staffId' });

Service.hasMany(Appointment, { foreignKey: 'serviceId' });
Appointment.belongsTo(Service, { foreignKey: 'serviceId' });

// Review belongs to one Appointment, one customer (User), one Staff
Appointment.hasOne(Review, { foreignKey: 'appointmentId', onDelete: 'CASCADE' });
Review.belongsTo(Appointment, { foreignKey: 'appointmentId' });

User.hasMany(Review, { foreignKey: 'customerId' });
Review.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

Staff.hasMany(Review, { foreignKey: 'staffId' });
Review.belongsTo(Staff, { foreignKey: 'staffId' });

// Payment belongs to one Appointment
Appointment.hasMany(Payment, { foreignKey: 'appointmentId' });
Payment.belongsTo(Appointment, { foreignKey: 'appointmentId' });

// Invoice belongs to one Appointment and one Payment
Appointment.hasOne(Invoice, { foreignKey: 'appointmentId' });
Invoice.belongsTo(Appointment, { foreignKey: 'appointmentId' });

Payment.hasOne(Invoice, { foreignKey: 'paymentId' });
Invoice.belongsTo(Payment, { foreignKey: 'paymentId' });

module.exports = {
  sequelize,
  User,
  Staff,
  Service,
  StaffService,
  SalonSettings,
  Appointment,
  Review,
  Payment,
  Invoice,
};

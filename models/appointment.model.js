const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Appointment = sequelize.define('Appointment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    staffId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY, // e.g. '2026-08-29'
      allowNull: false,
    },
    startTime: {
      type: DataTypes.STRING, // '10:00' — kept as string for simple comparisons; could be TIME type
      allowNull: false,
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('booked', 'completed', 'cancelled', 'rescheduled'),
      allowNull: false,
      defaultValue: 'booked',
    },
    paymentStatus: {
      type: DataTypes.ENUM('unpaid', 'paid', 'refunded'),
      allowNull: false,
      defaultValue: 'unpaid',
    },
  }, {
    tableName: 'appointments',
    timestamps: true,
  });

  return Appointment;
};

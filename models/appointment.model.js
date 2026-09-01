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
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    startTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    endTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        'booked',
        'completed',
        'cancelled',
        'rescheduled'
      ),
      allowNull: false,
      defaultValue: 'booked',
    },

    paymentStatus: {
      type: DataTypes.ENUM(
        'unpaid',
        'paid',
        'refunded'
      ),
      allowNull: false,
      defaultValue: 'unpaid',
    },

    rescheduleCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

  }, {
    tableName: 'appointments',
    timestamps: true,

    indexes: [
      {
        unique: true,
        fields: ['staffId', 'date', 'startTime'],
      },
    ],
  });

  return Appointment;
};
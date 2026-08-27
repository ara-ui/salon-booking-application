const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
    },
    stripeSessionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'payments',
    timestamps: true,
  });

  return Payment;
};

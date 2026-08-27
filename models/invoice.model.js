const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    paymentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    issuedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    pdfUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, {
    tableName: 'invoices',
    timestamps: true,
  });

  return Invoice;
};

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM('customer', 'staff', 'admin'),
      allowNull: false,
      defaultValue: 'customer',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // --- Customer preferences (only meaningful for role='customer', but kept
    // on User rather than a separate table since they're simple scalar values) ---
    preferredStaffId: {
      type: DataTypes.INTEGER,
      allowNull: true, // FK to Staff.id, set up in models/index.js
    },
    reminderOptIn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true, // the reminder cron job checks this before emailing
    },
    preferenceNotes: {
      type: DataTypes.TEXT,
      allowNull: true, // free text — allergies, styling notes, anything a dropdown can't capture
    },
  }, {
    tableName: 'users',
    timestamps: true,
  });

  return User;
};

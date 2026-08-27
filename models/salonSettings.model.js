const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  // In practice this table will only ever have one row (id: 1) — the salon's default hours.
  // Same JSON shape as Staff.workingHours: { "mon": [{ "start": "09:00", "end": "18:00" }], ... }
  const SalonSettings = sequelize.define('SalonSettings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    workingHours: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  }, {
    tableName: 'salon_settings',
    timestamps: true,
  });

  return SalonSettings;
};

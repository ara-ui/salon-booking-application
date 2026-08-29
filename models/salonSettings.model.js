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
    // Holidays / early closings / one-off special hours for a specific date.
    // Shape: [{ date: 'YYYY-MM-DD', type: 'closed'|'special'|'early_close',
    //           start?: 'HH:MM', end?: 'HH:MM' }]. Nullable + no DB-level
    // default (kept application-side) to avoid MySQL JSON DEFAULT quirks on
    // ALTER TABLE for existing installs; code always treats a missing value
    // as an empty array.
    specialDates: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    tableName: 'salon_settings',
    timestamps: true,
  });

  return SalonSettings;
};

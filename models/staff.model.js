const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Staff = sequelize.define('Staff', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true, // one staff profile per user
    },
    specialization: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Example shape: { "mon": [{ "start": "09:00", "end": "17:00" }], "tue": [...], ... }
    // A day with no entry (or an empty array) means the staff member is off that day.
    workingHours: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    tableName: 'staff',
    timestamps: true,
  });

  return Staff;
};

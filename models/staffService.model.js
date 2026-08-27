const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  // Many-to-many join table: which staff can perform which services.
  const StaffService = sequelize.define('StaffService', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    staffId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  }, {
    tableName: 'staff_services',
    timestamps: false,
    indexes: [{ unique: true, fields: ['staffId', 'serviceId'] }],
  });

  return StaffService;
};

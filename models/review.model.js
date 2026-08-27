const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Review = sequelize.define('Review', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true, // one review per appointment
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    staffId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 5 },
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    staffResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'reviews',
    timestamps: true,
  });

  return Review;
};

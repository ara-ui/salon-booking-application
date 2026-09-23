const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: false,

    pool: {
      max: Number(process.env.DB_POOL_MAX || 10),
      min: Number(process.env.DB_POOL_MIN || 0),
      acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 30000),
      idle: Number(process.env.DB_POOL_IDLE_MS || 10000),
    },

    dialectOptions: {
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  }
);

module.exports = sequelize;
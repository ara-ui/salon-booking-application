require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const { sequelize } = require('./models');
const swaggerSpec = require('./docs/swagger');
const { errorHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const serviceRoutes = require('./routes/service.routes');
const staffRoutes = require('./routes/staff.routes');
const appointmentRoutes = require('./routes/appointment.routes');


const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(morgan('dev'));
app.use(express.json());

// Swagger docs — visit http://localhost:5000/api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/salon-settings', serviceRoutes.settingsRouter);
app.use('/api/staff', staffRoutes);
app.use('/api/appointments', appointmentRoutes);

// 404 fallback
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Global error handler — must be registered last
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // sync() creates tables that don't exist yet — fine for this project's
    // timeline. In a longer-lived project you'd use migrations instead.
    await sequelize.sync({ alter: true });
    console.log('Models synced.');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Swagger docs at http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

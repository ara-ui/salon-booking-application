require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const bcrypt = require('bcryptjs');

const { sequelize, User } = require('./models');
const swaggerSpec = require('./docs/swagger');
const { errorHandler } = require('./middleware/error.middleware');
const { scheduleReminderJob } = require('./utils/reminderCron');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const serviceRoutes = require('./routes/service.routes');
const staffRoutes = require('./routes/staff.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const paymentRoutes = require('./routes/payment.routes');
const reviewRoutes = require('./routes/review.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(morgan('dev'));
app.use(express.json());

// Frontend — plain HTML/CSS/JS, 3 role-based pages
app.use(express.static('public'));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/salon-settings', serviceRoutes.settingsRouter);
app.use('/api/staff', staffRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler — must be registered last
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    await sequelize.sync({ alter: true });

    // The old unique index on (staffId, date, startTime)
    // incorrectly blocks cancelled appointments from being
    // rebooked. Keep a separate staffId index for the FK,
    // then remove the old unique index.
    const queryInterface = sequelize.getQueryInterface();

    try {
      await queryInterface.addIndex('appointments', ['staffId'], {
        name: 'idx_appointments_staff_id',
      });

      console.log('Staff index created.');
    } catch (err) {
      // Index may already exist.
    }

    try {
      await queryInterface.removeIndex(
        'appointments',
        'appointments_staff_id_date_start_time'
      );

      console.log('Old appointment unique index removed.');
    } catch (err) {
      // Old index may already be removed.
    }

    console.log('Appointment indexes updated.');
    console.log('Models synced.');

    if (
      process.env.INITIAL_ADMIN_EMAIL &&
      process.env.INITIAL_ADMIN_PASSWORD
    ) {
      const existingAdmin = await User.findOne({
        where: { role: 'admin' },
      });

      if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(
          process.env.INITIAL_ADMIN_PASSWORD,
          10
        );

        await User.create({
          name: process.env.INITIAL_ADMIN_NAME || 'Admin',
          email: process.env.INITIAL_ADMIN_EMAIL,
          passwordHash,
          role: 'admin',
          isActive: true,
        });

        console.log(
          `Initial admin created: ${process.env.INITIAL_ADMIN_EMAIL}`
        );
      }
    }

    scheduleReminderJob();

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
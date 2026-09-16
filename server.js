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

const configuredOrigin = process.env.CLIENT_URL?.trim();
app.use(cors({
  origin: configuredOrigin || false,
  credentials: false,
}));

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '100kb' }));

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

    if (process.env.DB_SYNC === 'true') {
      await sequelize.sync({ alter: false });
      console.log('Database schema sync completed.');
    } else {
      console.log('Database schema sync skipped (DB_SYNC is not true).');
    }



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
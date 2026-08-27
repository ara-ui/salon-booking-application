const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Salon Appointment Booking System API',
      version: '1.0.0',
      description:
        'API for the Salon Appointment Booking System — auth, services, staff, appointments, payments, invoices, reviews, and admin management.',
    },
    servers: [{ url: '/api', description: 'Base API path' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the JWT returned from /auth/login here (without the word "Bearer").',
        },
      },
    },
  },
  // Every routes/*.js file with @swagger JSDoc comments gets picked up automatically.
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);

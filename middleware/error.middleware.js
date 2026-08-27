// Wrap async route handlers so thrown errors reach the error middleware
// instead of crashing the process. Usage: router.get('/x', asyncHandler(fn))
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Simple typed error you can throw from controllers: throw new AppError(404, 'Not found')
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Must be registered LAST, after all routes, in server.js
function errorHandler(err, req, res, next) {
  console.error(err);

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors.map((e) => e.message),
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Something went wrong on the server',
  });
}

module.exports = { asyncHandler, AppError, errorHandler };

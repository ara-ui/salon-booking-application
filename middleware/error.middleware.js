

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}


// Global error handler.
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'SequelizeUniqueConstraintError') {


    const isAppointmentSlotConflict =
      err.errors?.some((error) =>
        ['staffId', 'date', 'startTime'].includes(
          error.path
        )
      );

    if (isAppointmentSlotConflict) {
      return res.status(409).json({
        message:
          'That slot was just booked by someone else — please pick another.',
      });
    }

    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors?.map(
        (error) => error.message
      ) || [],
    });
  }


  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors?.map(
        (error) => error.message
      ) || [],
    });
  }

  const statusCode =
    err.statusCode || 500;

  res.status(statusCode).json({
    message:
      err.message ||
      'Something went wrong on the server',
  });
}


module.exports = {
  asyncHandler,
  AppError,
  errorHandler,
};
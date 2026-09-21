const { Appointment, Review, User, Staff } = require('../models');
const { AppError } = require('../middleware/error.middleware');

async function createReview(req, res) {
  const { appointmentId, rating, comment } = req.body;
  if (!appointmentId || !rating) throw new AppError(400, 'appointmentId and rating are required');
  if (rating < 1 || rating > 5) throw new AppError(400, 'rating must be between 1 and 5');

  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) throw new AppError(404, 'Appointment not found');
  if (appointment.customerId !== req.user.id) throw new AppError(403, 'You can only review your own appointments');
  if (appointment.status !== 'completed') throw new AppError(400, 'You can only review a completed appointment');
  if (appointment.paymentStatus !== 'paid') throw new AppError(400, 'Payment is required before you can leave feedback');

  const existing = await Review.findOne({ where: { appointmentId } });
  if (existing) throw new AppError(409, 'This appointment already has a review');

  const review = await Review.create({
    appointmentId,
    customerId: req.user.id,
    staffId: appointment.staffId,
    rating,
    comment,
  });

  res.status(201).json(review);
}

async function listReviews(req, res) {
  const { serviceId, staffId } = req.query;
  const where = {};
  if (staffId) where.staffId = staffId;

  const include = [
    { model: User, as: 'customer', attributes: ['id', 'name'] },
  ];
  if (serviceId) {
    include.push({ model: Appointment, where: { serviceId }, attributes: [] });
  }

  const reviews = await Review.findAll({ where, include });
  res.json(reviews);
}

async function respondToReview(req, res) {
  const { response } = req.body;
  if (!response) throw new AppError(400, 'response is required');

  const review = await Review.findByPk(req.params.id);
  if (!review) throw new AppError(404, 'Review not found');


  const isAssignedStaff = req.user.role === 'staff' && review.staffId === req.user.staffId;
  if (!isAssignedStaff && req.user.role !== 'admin') {
    throw new AppError(403, 'You can only respond to reviews about your own appointments');
  }

  review.staffResponse = response;
  await review.save();
  res.json(review);
}

module.exports = { createReview, listReviews, respondToReview };

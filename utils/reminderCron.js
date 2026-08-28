const cron = require('node-cron');
const { Op } = require('sequelize');
const { Appointment, User, Service } = require('../models');
const { sendReminder } = require('../utils/email');

function tomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * Finds every appointment happening tomorrow (status booked or rescheduled)
 * and emails a reminder to the customer. Exported directly so it can be
 * triggered on demand (admin endpoint, or a test) without waiting for the
 * schedule.
 */
async function runReminderJob() {
  const date = tomorrowDateString();
  const appointments = await Appointment.findAll({
    where: { date, status: { [Op.in]: ['booked', 'rescheduled'] } },
    include: [{ model: User, as: 'customer' }, { model: Service }],
  });

  for (const appt of appointments) {
    await sendReminder({
      to: appt.customer.email,
      customerName: appt.customer.name,
      serviceName: appt.Service.name,
      date: appt.date,
      startTime: appt.startTime,
    });
  }

  return { date, remindersSent: appointments.length };
}

// Runs once a day at 08:00 server time. Registered from server.js on startup.
function scheduleReminderJob() {
  cron.schedule('0 8 * * *', () => {
    runReminderJob().catch((err) => console.error('Reminder job failed:', err));
  });
  console.log('Reminder cron job scheduled — daily at 08:00, emails appointments happening the next day.');
}

module.exports = { scheduleReminderJob, runReminderJob };

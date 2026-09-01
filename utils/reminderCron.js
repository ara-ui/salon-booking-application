const cron = require('node-cron');
const { Op } = require('sequelize');
const { Appointment, User, Service } = require('../models');
const { sendReminder } = require('../utils/email');

function tomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}


async function runReminderJob() {
  const date = tomorrowDateString();
  const appointments = await Appointment.findAll({
    where: { date, status: { [Op.in]: ['booked', 'rescheduled'] } },
    include: [{ model: User, as: 'customer' }, { model: Service }],
  });

  let sent = 0;
  let skippedOptOut = 0;

  for (const appt of appointments) {
    if (appt.customer.reminderOptIn === false) {
      skippedOptOut++;
      continue;
    }
    await sendReminder({
      to: appt.customer.email,
      customerName: appt.customer.name,
      serviceName: appt.Service.name,
      date: appt.date,
      startTime: appt.startTime,
    });
    sent++;
  }

  return { date, remindersSent: sent, skippedOptOut };
}


function scheduleReminderJob() {
  cron.schedule('0 8 * * *', () => {
    runReminderJob().catch((err) => console.error('Reminder job failed:', err));
  });
  console.log('Reminder cron job scheduled — daily at 08:00, emails appointments happening the next day.');
}

module.exports = { scheduleReminderJob, runReminderJob };

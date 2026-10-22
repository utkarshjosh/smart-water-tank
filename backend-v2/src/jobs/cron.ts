import * as cron from 'node-cron';
import { refreshActiveRollups } from '../services/rollup.service';
import { checkDeviceOfflineAlerts } from '../services/alert.service';
import { sendDueInsights } from '../services/insight.service';

export function startCronJobs(): void {
  console.log('Starting cron jobs...');

  // Hourly and daily usage, every 5 minutes, for devices that reported in
  // the last two hours. Replaces the 1 AM job, which cut days in the server's
  // timezone and stored nothing finer than a day.
  cron.schedule('*/5 * * * *', async () => {
    try {
      await refreshActiveRollups();
    } catch (error) {
      console.error('Error in usage rollup job:', error);
    }
  });

  // Offline device check every 5 minutes.
  cron.schedule('*/5 * * * *', async () => {
    console.log('Checking for offline devices...');
    try {
      await checkDeviceOfflineAlerts();
    } catch (error) {
      console.error('Error in offline device check:', error);
    }
  });

  // Experimental daily insight, opt-in. Every 15 minutes so each user is
  // reached early in their waking hours; once a day is enforced per user.
  cron.schedule('7,22,37,52 * * * *', async () => {
    try {
      await sendDueInsights();
    } catch (error) {
      console.error('Error in daily insight job:', error);
    }
  });

  console.log('Cron jobs started');
}

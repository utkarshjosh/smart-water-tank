import * as cron from 'node-cron';
import { aggregateDailySummaries } from '../services/aggregation.service';
import { checkDeviceOfflineAlerts } from '../services/alert.service';

export function startCronJobs(): void {
  console.log('Starting cron jobs...');

  // Daily aggregation at 1 AM.
  cron.schedule('0 1 * * *', async () => {
    console.log('Running daily aggregation job...');
    try {
      await aggregateDailySummaries();
    } catch (error) {
      console.error('Error in daily aggregation job:', error);
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

  console.log('Cron jobs started');
}

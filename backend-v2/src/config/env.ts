import * as dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN,
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  firmwareStoragePath: process.env.FIRMWARE_STORAGE_PATH || './storage/firmware',
  alertOfflineThresholdMinutes: parseInt(process.env.ALERT_OFFLINE_THRESHOLD_MINUTES || '15', 10),
  leakThresholdLPerHour: parseFloat(process.env.LEAK_DETECTION_THRESHOLD_L_PER_HOUR || '50'),
};

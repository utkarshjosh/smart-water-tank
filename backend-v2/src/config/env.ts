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

  // --- MQTT (optional) -----------------------------------------------------
  // When MQTT_URL is UNSET, MQTT is DISABLED and the app runs HTTP-only, so
  // local dev/tests need no broker. When set (e.g. mqtt://host:1883 or
  // mqtts://host:8883), the MqttAdapter is started at boot.
  mqttUrl: process.env.MQTT_URL,
  // The BACKEND's own broker credentials (a privileged/static account),
  // distinct from per-device credentials the broker validates via the auth hook.
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  // TLS (prod): path to a CA bundle for a private broker CA, and whether to
  // verify the broker certificate (default true; set 'false' only for testing).
  mqttTlsCaPath: process.env.MQTT_TLS_CA_PATH,
  mqttTlsRejectUnauthorized: process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== 'false',
  // Shared secret the Mosquitto auth hook must present to the /mqtt-auth
  // endpoints. When unset, the endpoints accept unauthenticated hook calls
  // (fine when the broker is the only thing that can reach them on a private net).
  mqttAuthHookSecret: process.env.MQTT_AUTH_HOOK_SECRET,
};

import * as dotenv from 'dotenv';

dotenv.config();

// Express `trust proxy` setting. Default trusts only proxies on loopback, which
// is nginx on the same host: req.ip and every per-IP rate limit then see the
// real client address instead of 127.0.0.1. A direct client on loopback could
// spoof X-Forwarded-For, but that is the operator's own machine.
function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === '') return 'loopback';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  // In production the API is served publicly by Nginx. Keep the Node process
  // on loopback so broker-only routes are never reachable directly from the
  // internet. Development remains convenient with the normal all-interface
  // bind unless API_BIND_HOST is set explicitly.
  apiBindHost: process.env.API_BIND_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : undefined),
  corsOrigin: process.env.CORS_ORIGIN,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
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

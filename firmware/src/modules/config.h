/**
 * ============================================================================
 * Configuration Module
 * ============================================================================
 * Central configuration for the water tank monitoring system.
 * Edit these values or override via OTA config updates.
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ============================================================================
// Firmware Version
// ============================================================================

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.0.0-dev"
#endif

// ============================================================================
// WiFi Configuration
// ============================================================================

// Default WiFi credentials (can be overridden via config portal)
#define WIFI_SSID_DEFAULT           "Champs"
#define WIFI_PASSWORD_DEFAULT       "@susChamps@11"

// AP mode for configuration (do not change - used for setup portal)
#define AP_SSID             "WaterTank-Setup"
#define AP_PASSWORD         "watertank123"

// Connection settings
#define WIFI_CONNECT_TIMEOUT_MS     15000
#define WIFI_RECONNECT_INTERVAL_MS  30000

// ============================================================================
// Server Configuration
// ============================================================================

#define SERVER_HOST         "aquamind-api.utkarshjoshi.com"
#define SERVER_PORT         443
#define SERVER_ENDPOINT     "/api/v1/measurements"

// Default device ID and token (can be overridden via config portal)
#define DEVICE_ID_DEFAULT   "watertank"
#define DEVICE_TOKEN_DEFAULT "688bb1924d4a0f43d1ace8eaf9d4475d86841761c280fc4bf3650b51a32b8043"

// Use HTTPS (recommended)
#define USE_HTTPS           true

// MQTT (alternative to HTTP)
#define MQTT_ENABLED        false
#define MQTT_BROKER         "mqtt.your-server.com"
#define MQTT_PORT           8883
#define MQTT_USER           ""
#define MQTT_PASSWORD       ""
#define MQTT_TOPIC          "watertank/device1"

// ============================================================================
// Hardware Pin Configuration
// ============================================================================

// Ultrasonic Sensor (HC-SR04 or similar)
#define PIN_ULTRASONIC_TRIG     D1      // GPIO5
#define PIN_ULTRASONIC_ECHO     D2      // GPIO4

// Temperature Sensor (DS18B20)
#define PIN_TEMPERATURE         D3      // GPIO0

// Speaker/Buzzer
#define PIN_SPEAKER             D5      // GPIO14

// Battery ADC (through voltage divider)
#define PIN_BATTERY_ADC         A0      // ADC (0-1V input)

// Status LED
#define PIN_STATUS_LED          LED_BUILTIN

// ============================================================================
// Tank Configuration
// ============================================================================

// Tank dimensions (for volume calculation)
// Adjust these based on your tank geometry
#define TANK_HEIGHT_CM          150.0   // Total height in cm
#define TANK_LENGTH_CM          100.0   // Length in cm (for rectangular)
#define TANK_WIDTH_CM           100.0   // Width in cm (for rectangular)

// OR for cylindrical tank:
#define TANK_DIAMETER_CM     90.0
#define TANK_IS_CYLINDRICAL  true

// Sensor mounting offset (distance from sensor to max water level)
#define SENSOR_OFFSET_CM        10.0

// Empty/Full calibration
#define LEVEL_EMPTY_CM          140.0   // Distance when tank is empty
#define LEVEL_FULL_CM           20.0    // Distance when tank is full

// ============================================================================
// Alert Thresholds
// ============================================================================

#define TANK_FULL_THRESHOLD_L       900.0   // Alert when volume >= this
#define TANK_LOW_THRESHOLD_L        100.0   // Alert when volume <= this
#define BATTERY_LOW_THRESHOLD_V     3.3     // Battery voltage warning

// Hysteresis to prevent alert flapping
#define ALERT_HYSTERESIS_L          20.0

// Quiet hours (no audible alerts)
#define QUIET_HOURS_START           22      // 10 PM
#define QUIET_HOURS_END             7       // 7 AM

// ============================================================================
// Timing Configuration
// ============================================================================

// How often to take measurements (milliseconds)
#define MEASUREMENT_INTERVAL_MS     60000   // 1 minute

// How often to report to server (milliseconds)
#define REPORT_INTERVAL_MS          300000  // 5 minutes

// How often to check for OTA updates (milliseconds)
#define OTA_CHECK_INTERVAL_MS       3600000  // 1 hour

// Sensor stabilization delay
#define SENSOR_WARMUP_MS            100

// ============================================================================
// OTA Configuration
// ============================================================================

#define OTA_PASSWORD            ""  // Leave empty for no password
#define OTA_PORT                8266

// Remote OTA update URL base (deviceId will be appended in code)
// Final URL format: {OTA_UPDATE_URL_BASE}/{deviceId}/ota/latest
#define OTA_UPDATE_URL_BASE     "https://aquamind-api.utkarshjoshi.com/api/v1/devices"

// ============================================================================
// Runtime Config Class
// ============================================================================

namespace Config {
    // These can be modified at runtime and saved to flash
    extern unsigned long measurementIntervalMs;
    extern unsigned long reportIntervalMs;
    extern float tankFullThreshold;
    extern float tankLowThreshold;
    extern float batteryLowThreshold;
    extern float levelEmptyCm;
    extern float levelFullCm;
    
    // WiFi credentials (configurable via portal)
    extern String wifiSsid;
    extern String wifiPassword;
    
    // Device identification (configurable via portal)
    extern String deviceId;
    extern String deviceToken;
    
    // Load config from flash
    void load();
    
    // Save config to flash
    void save();
    
    // Reset to defaults
    void reset();
    
    // Apply config from JSON (for remote updates)
    bool applyFromJson(const char* json);
    
    // Get OTA hostname (uses deviceId)
    String getOtaHostname();
}

#endif // CONFIG_H


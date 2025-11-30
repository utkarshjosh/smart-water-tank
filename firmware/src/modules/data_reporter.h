/**
 * ============================================================================
 * Data Reporter Module
 * ============================================================================
 * Handles sending measurement data to the backend server
 */

#ifndef DATA_REPORTER_H
#define DATA_REPORTER_H

#include <Arduino.h>

namespace DataReporter {
    /**
     * Initialize the reporter
     */
    void init();
    
    /**
     * Send measurement data to server
     * @param levelCm Water level in cm
     * @param volumeL Volume in liters
     * @param tempC Temperature in Celsius
     * @param batteryV Battery voltage
     * @param rssi WiFi signal strength
     * @return true if sent successfully
     */
    bool send(float levelCm, float volumeL, float tempC, float batteryV, int rssi);
    
    /**
     * Send buffered measurement (from storage)
     * @param jsonData JSON string of measurement
     * @return true if sent successfully
     */
    bool sendBuffered(const char* jsonData);
    
    /**
     * Check server for config updates
     * @return true if new config received
     */
    bool checkConfigUpdate();
    
    /**
     * Set custom server endpoint (for testing)
     */
    void setEndpoint(const char* host, int port, const char* path);
}

#endif // DATA_REPORTER_H


/**
 * ============================================================================
 * Common Types
 * ============================================================================
 * Shared data structures used across modules
 */

#ifndef TYPES_H
#define TYPES_H

#include <Arduino.h>

/**
 * System state containing all sensor readings and status
 */
struct SystemState {
    float waterLevelCm;
    float volumeLiters;
    float temperatureC;
    float batteryVoltage;
    int wifiRssi;
    unsigned long lastMeasurement;
    unsigned long lastReport;
    bool wifiConnected;
    bool alertActive;
};

#endif // TYPES_H


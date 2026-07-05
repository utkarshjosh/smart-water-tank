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
    unsigned long lastOtaCheck;
    bool wifiConnected;
    bool alertActive;

    // True right after (re)connecting, so reports go out at
    // FAST_REPORT_INTERVAL_MS instead of waiting a full report interval.
    // Cleared once a live send succeeds and nothing is left buffered.
    bool fastReportMode;
};

#endif // TYPES_H



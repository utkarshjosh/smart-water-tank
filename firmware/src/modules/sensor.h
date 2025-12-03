/**
 * ============================================================================
 * Sensor Module
 * ============================================================================
 * Handles all sensor readings: ultrasonic, temperature, battery
 */

#ifndef SENSOR_H
#define SENSOR_H

#include <Arduino.h>

namespace Sensor {
    /**
     * Initialize all sensors
     */
    void init();
    
    /**
     * Read water level using ultrasonic sensor
     * @return Distance from sensor to water surface in cm
     */
    float readWaterLevel();
    
    /**
     * Calculate water volume from level
     * @param levelCm Distance reading in cm
     * @return Volume in liters
     */
    float calculateVolume(float levelCm);
    
    /**
     * Read temperature
     * @return Temperature in Celsius
     */
    float readTemperature();
    
    /**
     * Read battery voltage
     * @return Voltage in V
     */
    float readBatteryVoltage();
    
    /**
     * Get percentage of tank filled
     * @param levelCm Distance reading
     * @return Percentage 0-100
     */
    float getPercentage(float levelCm);
    
    /**
     * Perform sensor calibration (reads empty and full points)
     */
    void calibrate();
}

#endif // SENSOR_H



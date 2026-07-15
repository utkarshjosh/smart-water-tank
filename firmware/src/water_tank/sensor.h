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
     * @param valid Set to false if no echo was received on any sample
     *              (no sensor connected) - the returned distance is
     *              meaningless in that case and must not be reported.
     * @return Distance from sensor to water surface in cm
     */
    float readWaterLevel(bool &valid);
    
    /**
     * Calculate water volume from level (nameplate clamp-to-full model, using
     * the runtime geometry). Local/display use only - the server computes the
     * canonical volume.
     * @param levelCm Distance reading in cm
     * @return Volume in liters
     */
    float calculateVolume(float levelCm);

    /**
     * Full nameplate capacity in liters from the runtime geometry.
     */
    float totalCapacityL();
    
    /**
     * Read temperature
     * @param valid Set to false if the DS18B20 is disconnected - the
     *              returned value is a sentinel and must not be reported.
     * @return Temperature in Celsius
     */
    float readTemperature(bool &valid);
    
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



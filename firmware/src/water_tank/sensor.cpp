/**
 * Sensor Module Implementation
 */

#include "sensor.h"
#include "config.h"
#include <NewPing.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Ultrasonic sensor
static NewPing* sonar = nullptr;

// Temperature sensor
static OneWire* oneWire = nullptr;
static DallasTemperature* tempSensor = nullptr;

// Number of samples for averaging
#define NUM_SAMPLES         5
#define SAMPLE_DELAY_MS     50

// Max distance for ultrasonic (cm)
#define MAX_DISTANCE_CM     400

// ADC voltage divider ratio (adjust based on your circuit)
// If using 100k/100k divider: ratio = 2.0
// If using direct: ratio = 1.0 (ESP8266 ADC max is 1V!)
#define BATTERY_DIVIDER_RATIO   2.0

namespace Sensor {
    void init() {
        Serial.println(F("[Sensor] Initializing..."));
        
        // Initialize ultrasonic sensor
        sonar = new NewPing(PIN_ULTRASONIC_TRIG, PIN_ULTRASONIC_ECHO, MAX_DISTANCE_CM);
        
        // Initialize temperature sensor
        oneWire = new OneWire(PIN_TEMPERATURE);
        tempSensor = new DallasTemperature(oneWire);
        tempSensor->begin();
        
        // Warmup delay
        delay(SENSOR_WARMUP_MS);
        
        Serial.println(F("[Sensor] Initialized"));
    }

    float readWaterLevel() {
        if (!sonar) return -1;
        
        // Take multiple readings and use median
        float readings[NUM_SAMPLES];
        
        for (int i = 0; i < NUM_SAMPLES; i++) {
            unsigned int uS = sonar->ping();
            readings[i] = sonar->convert_cm(uS);
            
            // If reading is 0, sensor didn't get echo
            if (readings[i] == 0) {
                readings[i] = MAX_DISTANCE_CM;
            }
            
            delay(SAMPLE_DELAY_MS);
        }
        
        // Simple bubble sort for median
        for (int i = 0; i < NUM_SAMPLES - 1; i++) {
            for (int j = i + 1; j < NUM_SAMPLES; j++) {
                if (readings[j] < readings[i]) {
                    float temp = readings[i];
                    readings[i] = readings[j];
                    readings[j] = temp;
                }
            }
        }
        
        // Return median
        return readings[NUM_SAMPLES / 2];
    }

    float calculateVolume(float levelCm) {
        // Calculate water height from distance reading
        // levelCm is distance from sensor to water surface
        // waterHeight = emptyDistance - levelCm
        
        float waterHeightCm = Config::levelEmptyCm - levelCm;
        
        // Clamp to valid range
        if (waterHeightCm < 0) waterHeightCm = 0;
        float maxHeight = Config::levelEmptyCm - Config::levelFullCm;
        if (waterHeightCm > maxHeight) waterHeightCm = maxHeight;
        
        #ifdef TANK_IS_CYLINDRICAL
            // Cylindrical tank: V = π * r² * h
            float radiusCm = TANK_DIAMETER_CM / 2.0;
            float volumeCm3 = PI * radiusCm * radiusCm * waterHeightCm;
        #else
            // Rectangular tank: V = L * W * H
            float volumeCm3 = TANK_LENGTH_CM * TANK_WIDTH_CM * waterHeightCm;
        #endif
        
        // Convert cm³ to liters (1000 cm³ = 1 L)
        return volumeCm3 / 1000.0;
    }

    float readTemperature() {
        if (!tempSensor) return -127;
        
        tempSensor->requestTemperatures();
        float tempC = tempSensor->getTempCByIndex(0);
        
        // Check for error (-127 means no sensor or disconnected)
        if (tempC == DEVICE_DISCONNECTED_C) {
            Serial.println(F("[Sensor] Temperature sensor disconnected"));
            return -127;
        }
        
        return tempC;
    }

    float readBatteryVoltage() {
        // ESP8266 ADC is 10-bit (0-1023) with 0-1V range
        int rawAdc = analogRead(PIN_BATTERY_ADC);
        
        // Convert to voltage
        float voltage = (rawAdc / 1023.0) * BATTERY_DIVIDER_RATIO;
        
        // For LiPo: multiply by divider ratio to get actual battery voltage
        // Typical LiPo: 4.2V full, 3.0V empty
        
        return voltage;
    }

    float getPercentage(float levelCm) {
        float emptyDist = Config::levelEmptyCm;
        float fullDist = Config::levelFullCm;
        
        // Clamp level to valid range
        if (levelCm >= emptyDist) return 0;
        if (levelCm <= fullDist) return 100;
        
        // Linear interpolation
        float percentage = 100.0 * (emptyDist - levelCm) / (emptyDist - fullDist);
        
        return percentage;
    }

    void calibrate() {
        Serial.println(F("[Sensor] Calibration mode"));
        Serial.println(F("  1. Empty the tank completely"));
        Serial.println(F("  2. Press any key when ready..."));
        
        while (!Serial.available()) {
            delay(100);
        }
        Serial.read();
        
        float emptyReading = readWaterLevel();
        Serial.printf("  Empty level: %.1f cm\n", emptyReading);
        
        Serial.println(F("  3. Fill the tank to maximum level"));
        Serial.println(F("  4. Press any key when ready..."));
        
        while (!Serial.available()) {
            delay(100);
        }
        Serial.read();
        
        float fullReading = readWaterLevel();
        Serial.printf("  Full level: %.1f cm\n", fullReading);
        
        // Update config
        Config::levelEmptyCm = emptyReading;
        Config::levelFullCm = fullReading;
        Config::save();
        
        Serial.println(F("[Sensor] Calibration saved!"));
    }
}



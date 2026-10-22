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
static char tempFault = 0;   // see Sensor::lastTemperatureFault()

#define TEMP_READ_ATTEMPTS  3
#define TEMP_RETRY_DELAY_MS 50

// Number of samples for averaging
#define NUM_SAMPLES         5
#define SAMPLE_DELAY_MS     50

// Max distance for ultrasonic (cm)
#define MAX_DISTANCE_CM     400

// ADC voltage divider ratio (adjust based on your circuit)
// If using 100k/100k divider: ratio = 2.0
// If using direct: ratio = 1.0 (ESP8266 ADC max is 1V!)
#define BATTERY_DIVIDER_RATIO   2.0

namespace {
    // Distinguishes the two ways a DS18B20 reading goes missing, because they
    // have completely different fixes and the -127 the library returns for
    // both tells you nothing.
    //
    // A 1-Wire reset is answered by a presence pulse from any device on the
    // bus. No presence means the bus itself is the problem - almost always a
    // missing 4.7k pull-up from data to 3V3, since the bus is open-drain and
    // has nothing else to pull it high. Presence with no readable device
    // points at the sensor or the conversion instead.
    void reportOneWireBus() {
        if (!oneWire || !tempSensor) return;

        const bool presence = oneWire->reset() != 0;
        const uint8_t count = tempSensor->getDeviceCount();
        Serial.printf("[Sensor] 1-Wire on GPIO%d: presence=%s, devices=%u\n",
            PIN_TEMPERATURE, presence ? "yes" : "NO", static_cast<unsigned>(count));

        if (!presence) {
            Serial.println(F("[Sensor] No device answered. Check the 4.7k pull-up from data to 3V3, "
                             "and that data/GND share a twisted pair on long runs."));
            return;
        }

        DeviceAddress addr;
        for (uint8_t i = 0; i < count; i++) {
            if (!tempSensor->getAddress(addr, i)) continue;
            Serial.printf("[Sensor]   #%u ROM:", static_cast<unsigned>(i));
            for (uint8_t b = 0; b < 8; b++) Serial.printf(" %02X", addr[b]);
            Serial.println();
        }
    }
}

namespace Sensor {
    void powerOn() {
#if defined(PIN_SENSOR_POWER) && PIN_SENSOR_POWER >= 0
        pinMode(PIN_SENSOR_POWER, OUTPUT);
        digitalWrite(PIN_SENSOR_POWER, HIGH);
        Serial.println(F("[Sensor] Power gate enabled (Sensors ON)"));
        delay(SENSOR_WARMUP_MS);
#endif
    }

    void powerOff() {
#if defined(PIN_SENSOR_POWER) && PIN_SENSOR_POWER >= 0
        pinMode(PIN_SENSOR_POWER, OUTPUT);
        digitalWrite(PIN_SENSOR_POWER, LOW);
        Serial.println(F("[Sensor] Power gate disabled (Sensors OFF)"));
#endif
    }

    void init() {
        Serial.println(F("[Sensor] Initializing..."));
        
        powerOn();

        // Initialize ultrasonic sensor
        sonar = new NewPing(PIN_ULTRASONIC_TRIG, PIN_ULTRASONIC_ECHO, MAX_DISTANCE_CM);
        
        // Initialize temperature sensor
        oneWire = new OneWire(PIN_TEMPERATURE);
        tempSensor = new DallasTemperature(oneWire);
        tempSensor->begin();
        reportOneWireBus();
        
        Serial.println(F("[Sensor] Initialized"));
    }

    float readWaterLevel(bool &valid) {
        if (!sonar) {
            valid = false;
            return -1;
        }

        // Take multiple readings and use median
        float readings[NUM_SAMPLES];
        int echoCount = 0;

        for (int i = 0; i < NUM_SAMPLES; i++) {
            unsigned int uS = sonar->ping();
            readings[i] = sonar->convert_cm(uS);

            // If reading is 0, sensor didn't get echo
            if (readings[i] == 0) {
                readings[i] = MAX_DISTANCE_CM;
            } else {
                echoCount++;
            }

            delay(SAMPLE_DELAY_MS);
        }

        // No echo on any sample - no sensor connected. The substituted
        // MAX_DISTANCE_CM readings above are placeholders, not a real
        // measurement, so the caller must not report/act on this reading.
        valid = echoCount > 0;
        
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

    // Full nameplate capacity in liters, derived from the RUNTIME geometry
    // (server-pushed TankProfile, falling back to compile-time TANK_* defines
    // on first boot). Prefers the server-supplied total_capacity_l when set.
    float totalCapacityL() {
        if (Config::totalCapacityL > 0) return Config::totalCapacityL;

        float unitCm3;
        if (Config::tankShape == "cylindrical") {
            float radiusCm = Config::diameterCm / 2.0;
            unitCm3 = PI * radiusCm * radiusCm * Config::heightCm;
        } else {
            unitCm3 = Config::lengthCm * Config::widthCm * Config::heightCm;
        }
        return (unitCm3 / 1000.0) * (float)Config::parallelUnitCount;
    }

    float calculateVolume(float levelCm) {
        // Clamp-to-full nameplate model (matches the server's computeVolumeL):
        // volume = fill-percentage * total nameplate capacity. This keeps the
        // device's local (display-only) liters self-consistent with the
        // canonical server value derived from the same geometry. The percentage
        // itself uses the dead-zone clamp-to-full model in getPercentage().
        float pct = getPercentage(levelCm);   // 0..100
        return (pct / 100.0) * totalCapacityL();
    }

    float readTemperature(bool &valid) {
        valid = false;
        if (!tempSensor) {
            tempFault = 'P';
            return DEVICE_DISCONNECTED_C;
        }

        // A single corrupted bit fails the scratchpad CRC and the library
        // reports -127, the same value as a missing probe. On the ESP8266 the
        // bit-banged 1-Wire timing is easily disturbed (WiFi, a boot-strap pin
        // like GPIO0), so a few retries recover most of those reads.
        for (uint8_t attempt = 0; attempt < TEMP_READ_ATTEMPTS; attempt++) {
            if (attempt > 0) delay(TEMP_RETRY_DELAY_MS);

            if (!oneWire->reset()) {
                tempFault = 'P';
                continue;
            }

            tempSensor->requestTemperatures();
            const float tempC = tempSensor->getTempCByIndex(0);

            if (tempC == DEVICE_DISCONNECTED_C) {
                tempFault = 'R';
                // begin() caches the device list, so a probe that was absent when
                // init() ran stays invisible until it is re-enumerated.
                tempSensor->begin();
                continue;
            }
            // 85C is the scratchpad's power-on value: the probe reset between
            // the convert command and the read, which means its supply dipped.
            if (tempC == 85.0f) {
                tempFault = 'H';
                continue;
            }

            if (attempt > 0) {
                Serial.printf("[Sensor] Temperature read recovered on attempt %u\n",
                    static_cast<unsigned>(attempt + 1));
            }
            tempFault = 0;
            valid = true;
            return tempC;
        }

        Serial.printf("[Sensor] Temperature read failed %u times, fault '%c'\n",
            static_cast<unsigned>(TEMP_READ_ATTEMPTS), tempFault);
        reportOneWireBus();
        return DEVICE_DISCONNECTED_C;
    }

    char lastTemperatureFault() {
        return tempFault;
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
        
        bool emptyValid;
        float emptyReading = readWaterLevel(emptyValid);
        Serial.printf("  Empty level: %.1f cm\n", emptyReading);
        
        Serial.println(F("  3. Fill the tank to maximum level"));
        Serial.println(F("  4. Press any key when ready..."));
        
        while (!Serial.available()) {
            delay(100);
        }
        Serial.read();
        
        bool fullValid;
        float fullReading = readWaterLevel(fullValid);
        Serial.printf("  Full level: %.1f cm\n", fullReading);
        
        // Update config
        Config::levelEmptyCm = emptyReading;
        Config::levelFullCm = fullReading;
        Config::save();
        
        Serial.println(F("[Sensor] Calibration saved!"));
    }
}



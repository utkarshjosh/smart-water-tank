/**
 * Alerts Module Implementation
 */

#include "alerts.h"
#include "config.h"
#include <time.h>

// Tone frequencies
#define TONE_LOW        440     // A4
#define TONE_MID        880     // A5
#define TONE_HIGH       1760    // A6
#define TONE_ALERT      2000

namespace Alerts {
    void init() {
        Serial.println(F("[Alerts] Initializing..."));
        
        pinMode(PIN_SPEAKER, OUTPUT);
        pinMode(PIN_STATUS_LED, OUTPUT);
        
        digitalWrite(PIN_SPEAKER, LOW);
        digitalWrite(PIN_STATUS_LED, HIGH);  // LED off (active low on most ESP8266)
        
        Serial.println(F("[Alerts] Initialized"));
    }

    void playStartupSound() {
        // Pleasant ascending startup melody
        playTone(523, 100);  // C5
        delay(50);
        playTone(659, 100);  // E5
        delay(50);
        playTone(784, 150);  // G5
        
        blinkLed(2, 200, 100);
    }

    void triggerTankFull() {
        if (isQuietHours()) {
            // During quiet hours, just blink LED
            blinkLed(5, 100, 100);
            return;
        }
        
        // Happy melody for tank full
        for (int i = 0; i < 3; i++) {
            playTone(784, 200);   // G5
            delay(100);
            playTone(988, 200);   // B5
            delay(100);
            playTone(1175, 300);  // D6
            delay(300);
        }
        
        blinkLed(3, 300, 200);
    }

    void triggerTankLow() {
        if (isQuietHours()) {
            blinkLed(10, 100, 100);
            return;
        }
        
        // Warning descending tone
        for (int i = 0; i < 4; i++) {
            playTone(880, 300);   // A5
            delay(100);
            playTone(440, 500);   // A4
            delay(200);
        }
        
        blinkLed(5, 500, 300);
    }

    void triggerBatteryLow() {
        if (isQuietHours()) {
            blinkLed(3, 50, 50);
            return;
        }
        
        // Short warning beeps
        for (int i = 0; i < 2; i++) {
            playTone(TONE_ALERT, 100);
            delay(100);
        }
    }

    void trigger(int pattern) {
        switch (pattern) {
            case 1:  // Short beep
                playTone(TONE_MID, 100);
                break;
            case 2:  // Long beep
                playTone(TONE_MID, 500);
                break;
            case 3:  // Urgent (rapid beeps)
                for (int i = 0; i < 5; i++) {
                    playTone(TONE_ALERT, 100);
                    delay(50);
                }
                break;
            default:
                playTone(TONE_LOW, 200);
        }
    }

    void stop() {
        noTone(PIN_SPEAKER);
        digitalWrite(PIN_SPEAKER, LOW);
    }

    bool isQuietHours() {
        time_t now = time(nullptr);
        struct tm* timeInfo = localtime(&now);
        
        if (timeInfo == nullptr) {
            // If time not set, assume not quiet hours
            return false;
        }
        
        int hour = timeInfo->tm_hour;
        
        // Handle overnight quiet hours
        if (QUIET_HOURS_START > QUIET_HOURS_END) {
            // e.g., 22:00 to 07:00
            return (hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END);
        } else {
            // e.g., 01:00 to 06:00
            return (hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END);
        }
    }

    void playTone(int frequency, int duration) {
        // Use tone() for ESP8266
        tone(PIN_SPEAKER, frequency, duration);
        delay(duration);
        noTone(PIN_SPEAKER);
    }

    void blinkLed(int count, int onTime, int offTime) {
        for (int i = 0; i < count; i++) {
            digitalWrite(PIN_STATUS_LED, LOW);   // LED on (active low)
            delay(onTime);
            digitalWrite(PIN_STATUS_LED, HIGH);  // LED off
            delay(offTime);
        }
    }
}


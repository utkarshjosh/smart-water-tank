/**
 * Buttons Module Implementation
 */

#include "buttons.h"

#if DISPLAY_ENABLED

namespace {
    struct ButtonState {
        uint8_t pin;
        bool stableDown;         // debounced physical state
        bool lastSample;
        unsigned long lastChange;
        unsigned long pressedAt;
        bool longFired;          // long press already delivered for this hold
        bool shortPending;
        bool longPending;
    };

    ButtonState buttons[Buttons::COUNT] = {
        {PIN_BTN_NEXT,   false, false, 0, 0, false, false, false},
        {PIN_BTN_SELECT, false, false, 0, 0, false, false, false},
    };

#if defined(DEBUG) && DEBUG
    unsigned long rawChanges[Buttons::COUNT] = {0};
    unsigned long rawLastLog[Buttons::COUNT] = {0};
    unsigned long lastSummary = 0;
#endif
}

namespace Buttons {
    void init() {
        for (uint8_t i = 0; i < COUNT; i++) {
            // Never INPUT_PULLUP: these read active HIGH, and GPIO15 depends on
            // idling LOW to let the board boot at all. Each pin needs its
            // external 10k pull-down or it floats and reports phantom presses.
            pinMode(buttons[i].pin, INPUT);
        }
        Serial.println(F("[Buttons] Initialized (2 buttons, active HIGH, external pull-downs)"));

        // With neither button pressed both inputs must read LOW. Live raw
        // changes distinguish an unstable idle input from a polling stall.
        Serial.printf("[Buttons] raw at boot: NEXT(D5)=%d SELECT(D8)=%d  (both should be 0)\n",
            digitalRead(PIN_BTN_NEXT), digitalRead(PIN_BTN_SELECT));
    }

    void update() {
        const unsigned long now = millis();

        for (uint8_t i = 0; i < COUNT; i++) {
            ButtonState &b = buttons[i];
            const bool sample = digitalRead(b.pin) == HIGH;

            if (sample != b.lastSample) {
#if defined(DEBUG) && DEBUG
                ++rawChanges[i];
                if (now - rawLastLog[i] >= 100) {
                    Serial.printf("[Buttons] raw %s=%d t=%lu changes=%lu\n",
                        (i == NEXT) ? "NEXT" : "SELECT", sample, now, rawChanges[i]);
                    rawLastLog[i] = now;
                }
#endif
                b.lastSample = sample;
                b.lastChange = now;
                continue;   // wait out the bounce before believing it
            }

            if (now - b.lastChange < BUTTON_DEBOUNCE_MS || sample == b.stableDown) continue;

            b.stableDown = sample;
            Serial.printf("[Buttons] %s %s t=%lu held=%lums\n",
                (i == NEXT) ? "NEXT" : "SELECT", sample ? "down" : "up", now,
                sample ? 0UL : now - b.pressedAt);
            if (sample) {
                b.pressedAt = now;
                b.longFired = false;
            } else if (!b.longFired) {
                // Released before the long-press threshold, so it was a tap.
                b.shortPending = true;
            }
        }

        // A long press fires while the button is still held, so it feels like
        // the device responded rather than waiting for the finger to lift.
        for (uint8_t i = 0; i < COUNT; i++) {
            ButtonState &b = buttons[i];
            if (b.stableDown && !b.longFired && now - b.pressedAt >= BUTTON_LONG_PRESS_MS) {
                b.longFired = true;
                b.longPending = true;
            }
        }
#if defined(DEBUG) && DEBUG
        if (now - lastSummary >= 10000) {
            Serial.printf("[Buttons] idle/sample NEXT=%d SELECT=%d rawChanges=%lu/%lu t=%lu\n",
                digitalRead(PIN_BTN_NEXT), digitalRead(PIN_BTN_SELECT),
                rawChanges[NEXT], rawChanges[SELECT], now);
            lastSummary = now;
        }
#endif
    }

    bool takeShortPress(Id id) {
        if (id >= COUNT || !buttons[id].shortPending) return false;
        buttons[id].shortPending = false;
        return true;
    }

    bool takeLongPress(Id id) {
        if (id >= COUNT || !buttons[id].longPending) return false;
        buttons[id].longPending = false;
        return true;
    }

    bool anyHeld() {
        for (uint8_t i = 0; i < COUNT; i++) if (buttons[i].stableDown) return true;
        return false;
    }
}

#endif // DISPLAY_ENABLED

/**
 * ============================================================================
 * Buttons Module  (display builds only)
 * ============================================================================
 * Two panel buttons, polled and debounced. No interrupts: the main loop runs
 * often enough that polling is simpler and cannot race with WiFi work.
 *
 * Both are wired identically - one side to 3V3, the other to the GPIO, with a
 * 10k pull-down to GND - so they read active HIGH. That uniformity is not
 * cosmetic: GPIO15 must be LOW at boot or the ESP8266 will not start, so an
 * INPUT_PULLUP button to GND is not an option there. Wiring every button the
 * same way means one rule for the whole panel and no boot surprises.
 *
 * There is no backlight button. The backlight comes on with any press and
 * times out by itself, which is what a dedicated button would have done
 * anyway - see config.h for why GPIO16 cannot host one.
 */
#ifndef BUTTONS_H
#define BUTTONS_H

#include <Arduino.h>
#include "config.h"

#if DISPLAY_ENABLED

namespace Buttons {
    enum Id : uint8_t { NEXT = 0, SELECT = 1, COUNT = 2 };

    void init();

    // Call once per loop. Samples both and latches any completed press.
    void update();

    // Both consume the event, so a press is delivered exactly once.
    bool takeShortPress(Id id);
    bool takeLongPress(Id id);

    // True while any button is physically down - used to hold off screen
    // redraws mid-interaction.
    bool anyHeld();
}

#endif // DISPLAY_ENABLED
#endif // BUTTONS_H

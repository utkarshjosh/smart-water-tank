/**
 * ============================================================================
 * Display Module  (display builds only)
 * ============================================================================
 * A 16x2 character LCD on a PCF8574 I2C backpack, showing tank state to
 * somebody standing at the tank.
 *
 * The screen's real job is not convenience - the app already covers that. It
 * is local truth when the app, the WiFi or the server is broken, plus pairing
 * without carrying a laptop onto the roof. That is why the reading carries a
 * wall-clock timestamp: the HD44780 holds its own frame, so a dead device
 * leaves a perfectly readable but completely stale number on screen, and an
 * absolute time is the only thing that stays honest about when it was taken.
 */
#ifndef DISPLAY_H
#define DISPLAY_H

#include <Arduino.h>
#include "config.h"
#include "types.h"

#if DISPLAY_ENABLED

namespace Display {
    // Probes both common backpack addresses. False means no panel answered;
    // every other call then becomes a no-op so a missing screen never blocks
    // a device whose real job is reporting telemetry.
    bool init();
    bool ready();

    // Two literal lines, for setup-phase progress before there is any state.
    void showMessage(const char* line0, const char* line1);

    // --- Long blocking operations ------------------------------------------
    // Wi-Fi association, NTP and an OTA download each block for tens of
    // seconds. Without something moving on the panel a working device is
    // indistinguishable from a hung one, and the honest reading of a frozen
    // screen - by whoever is standing at the tank - is "pull the plug".
    //
    // Shared code reaches these through progress.h rather than calling them
    // directly, so wifi_manager, tls_client and ota_handler stay ignorant of
    // whether this build has a screen at all.

    // Start narrating an operation of unknown duration. Draws `text` on the
    // top line; the bottom line becomes an activity bar and elapsed seconds.
    void beginStage(const char* text);

    // Redraw the stage line. Cheap on every pass of a wait loop: throttled
    // internally, and a no-op when no stage is running.
    void stageTick();

    // Switch the current stage from indeterminate to a real fraction.
    void setStagePercent(uint8_t pct);

    // Stop narrating. update() also does this, so an ended operation cannot
    // leave a stale stage that a later tick would redraw over live state.
    void endStage();

    // Renders the current screen from live state. Cheap to call often: it
    // redraws only when the rendered text actually changes, because pushing
    // unchanged characters over I2C wastes time and makes the panel shimmer.
    void update(const SystemState &state);

    void nextScreen();

    // Lights the backlight and restarts its auto-off timer.
    void backlightOn();
    void backlightToggle();

    // Call once per loop: handles the backlight timeout.
    void tick();
}

#endif // DISPLAY_ENABLED
#endif // DISPLAY_H

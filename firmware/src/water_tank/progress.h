/**
 * ============================================================================
 * Progress Facade
 * ============================================================================
 * A variant-neutral way for shared code to narrate a long blocking operation
 * on the panel.
 *
 * Wi-Fi association, NTP and the OTA download all block for tens of seconds
 * inside files that have no business knowing whether this build has a screen:
 * wifi_manager.cpp, tls_client.h and ota_handler.cpp are compiled identically
 * for both products. Guarding every call site with `#if DISPLAY_ENABLED` would
 * put display concerns in four more files; this header keeps them in one.
 *
 * On a headless build every function below is an empty inline, so the default
 * binary pays nothing - not a branch, not a byte.
 *
 * The design rule for callers: a stage that cannot tick should be a note(),
 * not a stage(). A frozen progress bar is a worse lie than a static line of
 * text, because a bar promises movement.
 */
#ifndef PROGRESS_H
#define PROGRESS_H

#include <Arduino.h>
#include "config.h"

#if DISPLAY_ENABLED
#include "display.h"
#endif

namespace Progress {

    // Longest stage or note text a panel can show, plus its terminator. Lives
    // here rather than in display.h because callers that format a stage string
    // - tls_client.h numbering its NTP attempts - are compiled for the
    // headless build too, where display.h declares nothing at all.
    constexpr size_t TEXT_MAX = 17;

    /**
     * Begin a long operation with an indeterminate duration. Draws `text` on
     * the top line and starts an activity bar plus an elapsed-second count
     * underneath. Call tick() from inside the operation's wait loop.
     */
    inline void stage(const char* text) {
#if DISPLAY_ENABLED
        Display::beginStage(text);
#else
        (void)text;
#endif
    }

    /**
     * Advance the activity bar and the elapsed counter. Safe and cheap to call
     * on every pass of a wait loop: the panel is only rewritten a few times a
     * second, and never when the rendered text is unchanged.
     */
    inline void tick() {
#if DISPLAY_ENABLED
        Display::stageTick();
#endif
    }

    /**
     * Report real progress against a known total. Switches the bar from
     * "something is happening" to an actual fraction and prints the percentage
     * where the elapsed seconds would otherwise go.
     */
    inline void percent(uint8_t pct) {
#if DISPLAY_ENABLED
        Display::setStagePercent(pct);
#else
        (void)pct;
#endif
    }

    /**
     * Two static lines, for a step that blocks somewhere we cannot reach into
     * - a TLS handshake, an HTTP GET - or for an outcome worth reading.
     *
     * holdMs blocks after drawing, and only on a build that has a panel. Use
     * it sparingly: it is right for an outcome the main loop would otherwise
     * overwrite within milliseconds, and wrong for anything on the happy path.
     */
    inline void note(const char* line0, const char* line1, unsigned long holdMs = 0) {
#if DISPLAY_ENABLED
        // showMessage ends any running stage itself, so a note can safely
        // interrupt one.
        Display::showMessage(line0, line1);
        if (holdMs > 0 && Display::ready()) delay(holdMs);
#else
        (void)line0;
        (void)line1;
        (void)holdMs;
#endif
    }

    /**
     * Hand the panel back to the normal screens. The next Display::update()
     * does this anyway; calling it explicitly documents where the narrated
     * part of a boot ends.
     */
    inline void clear() {
#if DISPLAY_ENABLED
        Display::endStage();
#endif
    }
}

#endif // PROGRESS_H

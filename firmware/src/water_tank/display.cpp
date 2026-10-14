/**
 * Display Module Implementation
 */

#include "display.h"

#if DISPLAY_ENABLED

#include "lcd_pcf8574.h"
#include "sensor.h"
#include <ESP8266WiFi.h>
#include <Wire.h>
#include <time.h>

namespace {
    // CGRAM slot 0 cannot be used: its character code is 0, which would
    // terminate any C string it appears in. Glyphs therefore start at 1.
    const uint8_t GLYPH_WIFI_WEAK   = 1;
    const uint8_t GLYPH_WIFI_MID    = 2;
    const uint8_t GLYPH_WIFI_STRONG = 3;
    const uint8_t GLYPH_WIFI_NONE   = 4;
    const uint8_t GLYPH_LINK_OK     = 5;
    const uint8_t GLYPH_BAR         = 6;

    // Bit 4 is the leftmost of the five columns. Every signal glyph carries a
    // full-width baseline on the bottom row - without it a single bar is just
    // a mark floating in a cell and reads as a comma, not as weak signal.
    const uint8_t BITMAP_WIFI_WEAK[8]   = {0,0,0,0,0, 0b10000, 0b10000, 0b11111};
    const uint8_t BITMAP_WIFI_MID[8]    = {0,0,0, 0b00100, 0b00100, 0b10100, 0b10100, 0b11111};
    const uint8_t BITMAP_WIFI_STRONG[8] = {0, 0b00001, 0b00001, 0b00101, 0b00101, 0b10101, 0b10101, 0b11111};
    const uint8_t BITMAP_WIFI_NONE[8]   = {0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0, 0b11111};
    const uint8_t BITMAP_LINK_OK[8]     = {0b00100, 0b01110, 0b11111, 0b00100, 0b00100, 0b00100, 0, 0};

    // A solid cell for the progress bar. The HD44780 has a full block at 0xFF
    // in its character ROM, but which ROM a backpack ships with is not
    // knowable from the I2C address, and a wrong guess prints a random glyph
    // sixteen times. CGRAM costs one of the eight slots and cannot be wrong.
    const uint8_t BITMAP_BAR[8]         = {0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111};

    // Anything before 2024-01-01 UTC means NTP has not landed yet.
    const time_t MIN_VALID_EPOCH = 1704067200;

    enum Screen : uint8_t { SCREEN_READING = 0, SCREEN_NETWORK, SCREEN_DEVICE, SCREEN_COUNT };

    LcdPcf8574 lcd(LCD_ADDR_PRIMARY, LCD_COLS, LCD_ROWS);
    bool panelReady = false;
    uint8_t screen = SCREEN_READING;

    bool backlightLit = false;
    unsigned long backlightSince = 0;

    // Last text actually pushed, so update() can skip redundant I2C writes.
    char shown0[LCD_COLS + 1] = {0};
    char shown1[LCD_COLS + 1] = {0};

    // Wall-clock epoch of the most recent valid measurement. Held here rather
    // than in SystemState because it only matters for what the screen claims.
    time_t lastGoodReadingEpoch = 0;

    // --- Stage narration state ---------------------------------------------
    const uint8_t BAR_CELLS = 10;
    const unsigned long STAGE_REDRAW_MS = 250;

    bool stageActive = false;
    char stageText[LCD_COLS + 1] = {0};
    unsigned long stageStartedAt = 0;
    unsigned long stageLastDrawAt = 0;
    // Negative means indeterminate: we know it is working, not how far along.
    int16_t stagePercent = -1;

    void loadGlyphs() {
        lcd.createChar(GLYPH_WIFI_WEAK,   BITMAP_WIFI_WEAK);
        lcd.createChar(GLYPH_WIFI_MID,    BITMAP_WIFI_MID);
        lcd.createChar(GLYPH_WIFI_STRONG, BITMAP_WIFI_STRONG);
        lcd.createChar(GLYPH_WIFI_NONE,   BITMAP_WIFI_NONE);
        lcd.createChar(GLYPH_LINK_OK,     BITMAP_LINK_OK);
        lcd.createChar(GLYPH_BAR,         BITMAP_BAR);
        // createChar leaves the controller addressing CGRAM; re-address DDRAM
        // or the next character write lands in a glyph instead of on screen.
        lcd.setCursor(0, 0);
    }

    // Left flush-left, right flush-right, spaces between. The right side is
    // always status, so the left is what gets truncated when they collide.
    void padBetween(char* out, size_t outSize, const char* left, const char* right) {
        const size_t rightLen = strlen(right);
        const size_t maxLeft = (rightLen + 1 < LCD_COLS) ? LCD_COLS - rightLen - 1 : 0;
        size_t leftLen = strlen(left);
        if (leftLen > maxLeft) leftLen = maxLeft;

        size_t i = 0;
        for (size_t j = 0; j < leftLen && i < outSize - 1; j++) out[i++] = left[j];
        while (i + rightLen < LCD_COLS && i < outSize - 1) out[i++] = ' ';
        for (size_t j = 0; j < rightLen && i < outSize - 1; j++) out[i++] = right[j];
        out[i] = '\0';
    }

    // Signal strength, then a dot when the server acknowledged our last send.
    // "On WiFi" and "reaching the server" are different failures, and a device
    // joined to WiFi with a dead broker looks healthy without this distinction.
    void buildStatusGlyphs(char* out, const SystemState &state) {
        if (!state.wifiConnected) out[0] = static_cast<char>(GLYPH_WIFI_NONE);
        else if (state.wifiRssi >= -60) out[0] = static_cast<char>(GLYPH_WIFI_STRONG);
        else if (state.wifiRssi >= -75) out[0] = static_cast<char>(GLYPH_WIFI_MID);
        else out[0] = static_cast<char>(GLYPH_WIFI_WEAK);
        out[1] = (state.wifiConnected && !state.fastReportMode) ? static_cast<char>(GLYPH_LINK_OK) : ' ';
        out[2] = '\0';
    }

    uint8_t percentFull(const SystemState &state) {
        if (!state.waterLevelValid) return 0;
        float pct;
        if (Config::totalCapacityL > 0) {
            pct = (state.volumeLiters / Config::totalCapacityL) * 100.0f;
        } else {
            // waterLevelCm is the raw sensor-to-surface distance, so it shrinks
            // as the tank fills - hence empty minus current, not the reverse.
            const float span = Config::levelEmptyCm - Config::levelFullCm;
            if (span <= 0) return 0;
            pct = ((Config::levelEmptyCm - state.waterLevelCm) / span) * 100.0f;
        }
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        return static_cast<uint8_t>(pct + 0.5f);
    }

    // HH:MM of the last valid reading, in local time. tls_client configures NTP
    // as configTime(0, 0, ...) so the clock runs in UTC and the offset is
    // applied here rather than through the TZ database.
    void formatReadingClock(char* out, size_t outSize) {
        if (lastGoodReadingEpoch < MIN_VALID_EPOCH) {
            snprintf(out, outSize, "--:--");
            return;
        }
        const time_t local = lastGoodReadingEpoch + (DISPLAY_TZ_OFFSET_MIN * 60);
        struct tm t;
        gmtime_r(&local, &t);
        snprintf(out, outSize, "%02d:%02d", t.tm_hour, t.tm_min);
    }

    // Whole degrees, no unit symbol: at 16 columns a decimal place buys a
    // number nobody acts on, and the HD44780's degree glyph is not portable
    // across the ROM variants these panels ship with.
    //
    // A disconnected DS18B20 prints "--C" rather than disappearing, matching
    // the clock's "--:--". A field that vanishes when its sensor dies looks
    // exactly like a field that was never designed in, and someone standing
    // at the tank should be able to tell a dead probe from a missing one.
    void formatTemperature(char* out, size_t outSize, const SystemState &state) {
        if (!state.temperatureValid) {
            snprintf(out, outSize, "--C");
            return;
        }
        snprintf(out, outSize, "%.0fC", state.temperatureC);
    }

    void renderReading(char* line0, char* line1, size_t n, const SystemState &state) {
        char glyphs[3];
        buildStatusGlyphs(glyphs, state);

        // A device that never finished pairing has nothing true to show about
        // a tank, so the screen becomes the pairing instructions instead.
        if (!Config::isMqttProvisioned()) {
            snprintf(line0, n, "PAIRING MODE");
            snprintf(line1, n, "%s", AP_SSID);
            return;
        }

        // A disconnected ultrasonic reads as 0cm, which the tank math renders
        // as a full tank. Saying FAULT beats showing a confident wrong number.
        if (!state.waterLevelValid) {
            padBetween(line0, n, "SENSOR FAULT", glyphs);
            snprintf(line1, n, "no echo returned");
            return;
        }

        char left[LCD_COLS + 1];
        snprintf(left, sizeof(left), "Tank %u%%", percentFull(state));
        padBetween(line0, n, left, glyphs);

        char volume[10];
        char clock[8];
        char temp[8];
        snprintf(volume, sizeof(volume), "%.0fL", state.volumeLiters);
        formatReadingClock(clock, sizeof(clock));
        formatTemperature(temp, sizeof(temp), state);

        // Temperature rides on the volume side of the reading line instead of
        // getting a screen of its own: it is a glance, not something anyone
        // walks to the tank and presses a button for. When the three fields
        // cannot all fit - a very large tank in litres - the temperature is
        // dropped whole rather than truncated, because "1260L 2 14:32" is a
        // worse screen than one with no temperature on it.
        char measured[LCD_COLS + 1];
        if (strlen(volume) + strlen(temp) + strlen(clock) + 2 <= LCD_COLS) {
            snprintf(measured, sizeof(measured), "%s %s", volume, temp);
        } else {
            snprintf(measured, sizeof(measured), "%s", volume);
        }
        padBetween(line1, n, measured, clock);
    }

    void renderNetwork(char* line0, char* line1, size_t n, const SystemState &state) {
        char glyphs[3];
        buildStatusGlyphs(glyphs, state);

        if (!state.wifiConnected) {
            padBetween(line0, n, "WiFi offline", glyphs);
            snprintf(line1, n, "%s", Config::wifiSsid.c_str());
            return;
        }

        char left[LCD_COLS + 1];
        snprintf(left, sizeof(left), "%ddBm", state.wifiRssi);
        padBetween(line0, n, left, glyphs);
        snprintf(line1, n, "%s", WiFi.localIP().toString().c_str());
    }

    void renderDevice(char* line0, char* line1, size_t n, const SystemState &state) {
        (void)state;
        snprintf(line0, n, "fw %s", FIRMWARE_VERSION);
        snprintf(line1, n, "%s", Config::deviceId.length() ? Config::deviceId.c_str() : "unclaimed");
    }

    // Bottom line of a narrated stage: an activity bar on the left, and on the
    // right either a real percentage or the seconds spent so far.
    //
    // The elapsed count is the load-bearing half. A bar alone cannot tell you
    // whether a stage has been running for four seconds or forty, and forty is
    // the number that means "go look at the router".
    void renderStageBar(char* out, size_t outSize) {
        const unsigned long elapsedMs = millis() - stageStartedAt;

        uint8_t filled;
        if (stagePercent >= 0) {
            filled = static_cast<uint8_t>((stagePercent * BAR_CELLS + 50) / 100);
        } else {
            // Indeterminate: a wipe that fills over five seconds and restarts.
            // It deliberately does not resemble a fraction of a known total,
            // because there isn't one - the seconds counter carries the truth.
            filled = static_cast<uint8_t>((elapsedMs / 500) % BAR_CELLS) + 1;
        }
        if (filled > BAR_CELLS) filled = BAR_CELLS;

        char bar[BAR_CELLS + 1];
        for (uint8_t i = 0; i < BAR_CELLS; i++) {
            bar[i] = (i < filled) ? static_cast<char>(GLYPH_BAR) : '.';
        }
        bar[BAR_CELLS] = '\0';

        char right[8];
        if (stagePercent >= 0) {
            snprintf(right, sizeof(right), "%d%%", stagePercent);
        } else {
            snprintf(right, sizeof(right), "%lus", elapsedMs / 1000);
        }

        padBetween(out, outSize, bar, right);
    }

    void push(const char* line0, const char* line1) {
        if (strncmp(shown0, line0, LCD_COLS) == 0 && strncmp(shown1, line1, LCD_COLS) == 0) return;
        lcd.printLine(0, line0);
        lcd.printLine(1, line1);
        strncpy(shown0, line0, LCD_COLS); shown0[LCD_COLS] = '\0';
        strncpy(shown1, line1, LCD_COLS); shown1[LCD_COLS] = '\0';
    }

    void drawStage(bool force) {
        if (!panelReady || !stageActive) return;
        const unsigned long now = millis();
        // Unthrottled, a tick inside a 250ms wait loop would push sixteen
        // characters over a bit-banged 100kHz bus for no visible gain, and
        // inside the OTA download loop it would do so thousands of times.
        if (!force && now - stageLastDrawAt < STAGE_REDRAW_MS) return;
        stageLastDrawAt = now;

        char line1[LCD_COLS + 1];
        renderStageBar(line1, sizeof(line1));
        push(stageText, line1);
    }
}

namespace Display {
    bool init() {
        Wire.begin(PIN_LCD_SDA, PIN_LCD_SCL);
        Wire.setClock(100000);   // HD44780 backpacks are not fast parts

        const uint8_t candidates[2] = {LCD_ADDR_PRIMARY, LCD_ADDR_FALLBACK};
        for (uint8_t i = 0; i < 2; i++) {
            LcdPcf8574 probe(candidates[i], LCD_COLS, LCD_ROWS);
            if (probe.begin()) {
                lcd = probe;
                panelReady = true;
                Serial.printf("[Display] LCD at 0x%02X\n", candidates[i]);
                break;
            }
        }

        if (!panelReady) {
            Serial.println(F("[Display] No LCD found at 0x27 or 0x3F; continuing headless"));
            return false;
        }

        loadGlyphs();
        backlightOn();
        return true;
    }

    bool ready() { return panelReady; }

    void showMessage(const char* line0, const char* line1) {
        if (!panelReady) return;
        // An explicit message always wins. Without this a stage left running
        // by an operation that returned early would have its next tick redraw
        // the bar straight over the message that replaced it.
        stageActive = false;
        push(line0, line1);
    }

    void beginStage(const char* text) {
        if (!panelReady) return;
        strncpy(stageText, text, LCD_COLS);
        stageText[LCD_COLS] = '\0';
        stageActive = true;
        stageStartedAt = millis();
        stageLastDrawAt = 0;
        stagePercent = -1;

        // Every stage is something a person would want to watch, and the
        // blocking wait it narrates keeps loop() - and so the backlight
        // timeout - from running until it finishes. The lamp stays on for
        // exactly as long as there is something to see.
        backlightOn();
        drawStage(true);
    }

    void stageTick() {
        drawStage(false);
    }

    void setStagePercent(uint8_t pct) {
        if (!stageActive) return;
        stagePercent = (pct > 100) ? 100 : static_cast<int16_t>(pct);
        drawStage(false);
    }

    void endStage() {
        stageActive = false;
        stagePercent = -1;
    }

    void update(const SystemState &state) {
        if (!panelReady) return;

        // Live state supersedes narration. Reaching here means the blocking
        // operation is over, whatever its outcome.
        stageActive = false;

        // Stamp the reading time from the same state that is about to be drawn,
        // so the clock on screen always belongs to the number beside it.
        if (state.waterLevelValid) {
            const time_t now = time(nullptr);
            if (now >= MIN_VALID_EPOCH) lastGoodReadingEpoch = now;
        }

        char line0[LCD_COLS + 1];
        char line1[LCD_COLS + 1];

        switch (screen) {
            case SCREEN_NETWORK: renderNetwork(line0, line1, sizeof(line0), state); break;
            case SCREEN_DEVICE:  renderDevice(line0, line1, sizeof(line0), state);  break;
            case SCREEN_READING:
            default:             renderReading(line0, line1, sizeof(line0), state); break;
        }

        push(line0, line1);
    }

    void nextScreen() {
        screen = (screen + 1) % SCREEN_COUNT;
        // Force the next update() to draw even if the text happens to match.
        shown0[0] = '\0';
        shown1[0] = '\0';
    }

    void backlightOn() {
        if (!panelReady) return;
        lcd.backlight();
        backlightLit = true;
        backlightSince = millis();
    }

    void backlightToggle() {
        if (!panelReady) return;
        if (backlightLit) {
            lcd.noBacklight();
            backlightLit = false;
        } else {
            backlightOn();
        }
    }

    void tick() {
        if (!panelReady || !backlightLit || BACKLIGHT_TIMEOUT_MS == 0) return;
        if (millis() - backlightSince >= BACKLIGHT_TIMEOUT_MS) {
            lcd.noBacklight();
            backlightLit = false;
        }
    }
}

#endif // DISPLAY_ENABLED

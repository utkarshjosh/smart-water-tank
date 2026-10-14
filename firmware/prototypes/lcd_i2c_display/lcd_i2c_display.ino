/**
 * ============================================================================
 * I2C LCD Display Prototype  -  ESP8266 (NodeMCU v2)
 * ============================================================================
 * PURPOSE
 *   The "test dummy circuit" for putting a screen on the tank-side device.
 *   It answers three questions and nothing else:
 *
 *     1. Is the PCF8574 backpack actually on the I2C bus at the pins we chose?
 *     2. Does every screen we plan to show fit legibly in 16x2 characters?
 *     3. Do the custom glyphs (WiFi bars, droplet, link dot) render?
 *
 *   There is NO WiFi, no sensor, no MQTT, no tank math here. Every value on
 *   screen is fabricated by fakeStateFor() below. That is deliberate: this
 *   sketch must be flashable onto a bare NodeMCU with only an LCD attached.
 *
 * WHY THIS IS NOT THE OTHER LCD PROTOTYPE
 *   prototypes/lcd_display/ drives an HD44780 in 4-bit PARALLEL mode - six
 *   GPIOs. The main board does not have six GPIOs to spare. This sketch uses
 *   an I2C backpack instead: two wires total.
 *
 * ----------------------------------------------------------------------------
 * WIRING  (NodeMCU v2 -> PCF8574 I2C LCD backpack)
 * ----------------------------------------------------------------------------
 *   LCD VCC  -> 5V (VIN)   The HD44780 needs 5V for readable contrast. The
 *                          backpack's I2C lines are open-drain and pulled to
 *                          5V through its onboard resistors - see the 5V note.
 *   LCD GND  -> GND        Must share ground with the NodeMCU.
 *   LCD SDA  -> D7 (GPIO13)
 *   LCD SCL  -> D4 (GPIO2)
 *
 *   Contrast: the blue pot on the back of the backpack. Out of the box it is
 *   usually turned fully one way and the screen shows either nothing or two
 *   rows of solid blocks. Both mean "adjust the pot", not "broken".
 *
 * ----------------------------------------------------------------------------
 * WHY THESE TWO PINS
 * ----------------------------------------------------------------------------
 *   The pins silkscreened SDA/SCL (D2/D1) are already the ultrasonic sensor's
 *   ECHO/TRIG on the real board. That is fine: the ESP8266 has no fixed
 *   hardware I2C peripheral at all - Wire is bit-banged in software, so
 *   Wire.begin(sda, scl) works on any pair of GPIOs. D1/D2 are not special.
 *
 *   D7 (GPIO13) is the one genuinely unused pin on the board.
 *   D4 (GPIO2) is the status LED. On a display build the LCD replaces it -
 *   the screen says more than a blink ever did. GPIO2 must be HIGH at boot or
 *   the ESP8266 will not start, and an I2C bus idles HIGH through its
 *   pull-ups, so this is electrically safe rather than merely tolerable.
 *
 *   Do NOT move either line to D8 (GPIO15): it must be LOW at boot, and an
 *   I2C pull-up would hold it HIGH and stop the board booting entirely.
 *
 * ----------------------------------------------------------------------------
 * THE 5V NOTE (read before wiring)
 * ----------------------------------------------------------------------------
 *   Most backpacks pull SDA/SCL up to whatever VCC you give them. Powered
 *   from 5V, that puts 5V on GPIO13 and GPIO2, which are 3.3V parts. In
 *   practice these boards are run this way constantly and survive, but it is
 *   out of spec. Two clean options:
 *     - Power the backpack from 3V3. Contrast is dimmer but usually readable,
 *       and the bus then idles at a correct 3.3V. Try this first.
 *     - Keep 5V for the panel and add a 2-channel level shifter on SDA/SCL.
 *   The production build should do one of these deliberately, not by accident.
 *
 * ----------------------------------------------------------------------------
 * FLASH & WATCH  (run from firmware/)
 * ----------------------------------------------------------------------------
 *   arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 prototypes/lcd_i2c_display
 *   arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 \
 *       -p /dev/tty.usbserial-XXXX prototypes/lcd_i2c_display
 *   arduino-cli monitor -p /dev/tty.usbserial-XXXX -c baudrate=115200
 *
 *   Serial keys while running:  n = next screen   p = previous screen
 *                               a = resume auto-cycling (default)
 *                               s = scan the I2C bus again
 *                               b = toggle the backlight
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include "lcd_pcf8574.h"

// ============================================================================
// Hardware configuration
// ============================================================================

#define PIN_LCD_SDA     13      // D7
#define PIN_LCD_SCL     2       // D4 (was the status LED)

#define LCD_COLS        16
#define LCD_ROWS        2

// The two addresses essentially every backpack ships on. Which one you get
// depends on whether the module uses a PCF8574 (0x27) or PCF8574A (0x3F).
// setup() probes both, so you do not have to know in advance.
static const uint8_t CANDIDATE_ADDRESSES[] = {0x27, 0x3F};

// How long each demo screen stays up while auto-cycling.
#define SCREEN_DWELL_MS 3000

// ============================================================================
// Custom glyphs
//
// CGRAM slot 0 is unusable in a C string (its character code is 0, which
// terminates the string), so we start at slot 1 and leave slot 0 empty.
// ============================================================================

#define GLYPH_WIFI_WEAK    1
#define GLYPH_WIFI_MID     2
#define GLYPH_WIFI_STRONG  3
#define GLYPH_WIFI_NONE    4
#define GLYPH_LINK_OK      5

// Bit 4 is the leftmost of the five columns, bit 0 the rightmost.
//
// Every signal glyph carries a full-width baseline on the bottom row. Without
// it, one lonely bar is just a mark floating in a character cell and reads as
// a comma or an apostrophe rather than "weak signal". The baseline is what
// makes the eye see a bar chart, and it costs nothing.
static const uint8_t BITMAP_WIFI_WEAK[8] = {
    0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b10000, 0b10000, 0b11111
};
static const uint8_t BITMAP_WIFI_MID[8] = {
    0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b10100, 0b10100, 0b11111
};
static const uint8_t BITMAP_WIFI_STRONG[8] = {
    0b00000, 0b00001, 0b00001, 0b00101, 0b00101, 0b10101, 0b10101, 0b11111
};
// An X sitting on the same baseline, so "no signal" reads as the same chart
// with nothing in it rather than as an unrelated symbol.
static const uint8_t BITMAP_WIFI_NONE[8] = {
    0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b00000, 0b11111
};
// An up arrow, not a dot. This means "the server acknowledged our last send",
// and a plain filled square said nothing at all about direction or meaning.
static const uint8_t BITMAP_LINK_OK[8] = {
    0b00100, 0b01110, 0b11111, 0b00100, 0b00100, 0b00100, 0b00000, 0b00000
};

// ============================================================================
// Display state
//
// This struct is the contract between "what the device knows" and "what the
// screen shows". The real firmware will populate it from SystemState, Config
// and the MQTT reporter; here fakeStateFor() populates it with invented
// numbers. renderScreen() below never learns the difference - which is the
// whole point, since renderScreen() is the part meant to graduate into
// firmware/src/water_tank/ unchanged.
// ============================================================================

enum DisplayMode : uint8_t {
    MODE_BOOT,
    MODE_WIFI_CONNECTING,
    MODE_PAIRING_PORTAL,
    MODE_CLAIM_CODE,
    MODE_READING_ONLINE,
    MODE_READING_OFFLINE,
    MODE_ALERT_LOW,
    MODE_ALERT_FULL,
    MODE_OTA_PROGRESS,
    MODE_SENSOR_FAULT,
    MODE_SLEEPING,
    MODE__COUNT
};

struct DisplayState {
    DisplayMode mode;
    const char* fwVersion;
    const char* ssid;
    const char* claimCode;
    bool        wifiConnected;
    int8_t      rssi;            // dBm, negative
    bool        serverLinkOk;    // last telemetry publish was acknowledged
    bool        levelValid;
    float       levelCm;
    float       volumeL;
    float       capacityL;
    float       temperatureC;
    uint16_t    bufferedCount;   // readings held on flash while offline
    uint8_t     otaPercent;
    uint32_t    sleepSeconds;
};

// ============================================================================
// Globals
// ============================================================================

static LcdPcf8574 lcd(0x27, LCD_COLS, LCD_ROWS);
static bool lcdReady = false;
static uint8_t currentScreen = 0;
static bool autoCycle = true;
static unsigned long lastScreenChange = 0;
static bool backlightOn = true;

// ============================================================================
// Line-building helpers
//
// Every line handed to the LCD is exactly LCD_COLS characters. printLine()
// pads for us, but building the text in a fixed buffer here keeps the
// formatting decisions in one readable place.
// ============================================================================

// Left text flush-left, right text flush-right, spaces between. If they cannot
// both fit, the left text is truncated - the right side is status (WiFi, link)
// and losing it silently would be worse than a clipped label.
static void padBetween(char* out, size_t outSize, const char* left, const char* right) {
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

// The 2-character status cluster that sits at the right edge of the top line:
// signal strength, then a dot when the server has acknowledged our last send.
// "Connected to WiFi" and "reaching the server" are different failures and the
// screen has to tell them apart - a device on WiFi with a dead broker looks
// perfectly healthy otherwise.
static void buildStatusGlyphs(char* out, const DisplayState& s) {
    if (!s.wifiConnected) {
        out[0] = GLYPH_WIFI_NONE;
    } else if (s.rssi >= -60) {
        out[0] = GLYPH_WIFI_STRONG;
    } else if (s.rssi >= -75) {
        out[0] = GLYPH_WIFI_MID;
    } else {
        out[0] = GLYPH_WIFI_WEAK;
    }
    out[1] = s.serverLinkOk ? GLYPH_LINK_OK : ' ';
    out[2] = '\0';
}

static uint8_t percentFull(const DisplayState& s) {
    if (!s.levelValid || s.capacityL <= 0) return 0;
    float pct = (s.volumeL / s.capacityL) * 100.0f;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return static_cast<uint8_t>(pct + 0.5f);
}

// "[####      ] 42%" - exactly 16 characters at any percentage.
static void buildProgressBar(char* out, size_t outSize, uint8_t percent) {
    const uint8_t cells = 10;
    const uint8_t filled = (percent * cells) / 100;
    char bar[cells + 1];
    for (uint8_t i = 0; i < cells; i++) bar[i] = (i < filled) ? '#' : ' ';
    bar[cells] = '\0';
    snprintf(out, outSize, "[%s]%3u%%", bar, percent);
}

// ============================================================================
// The renderer  -  state in, two lines out
// ============================================================================

static void renderScreen(const DisplayState& s) {
    char line0[LCD_COLS + 1];
    char line1[LCD_COLS + 1];
    char glyphs[3];
    buildStatusGlyphs(glyphs, s);

    switch (s.mode) {
        case MODE_BOOT: {
            char version[12];
            snprintf(version, sizeof(version), "v%s", s.fwVersion);
            padBetween(line0, sizeof(line0), "AquaMind", version);
            snprintf(line1, sizeof(line1), "starting up...");
            break;
        }

        case MODE_WIFI_CONNECTING: {
            snprintf(line0, sizeof(line0), "WiFi connecting");
            snprintf(line1, sizeof(line1), "%s", s.ssid);
            break;
        }

        // The config portal is up and the phone needs to join the device's own
        // access point. The SSID is the only thing that matters here, so it
        // gets a whole line to itself.
        case MODE_PAIRING_PORTAL: {
            snprintf(line0, sizeof(line0), "PAIRING MODE");
            snprintf(line1, sizeof(line1), "WaterTank-Setup");
            break;
        }

        // The claim code the user types into the app to bind this hardware to
        // their account. Printing it on the device removes the worst step of
        // provisioning: hunting for it in a serial log or on a sticker.
        case MODE_CLAIM_CODE: {
            snprintf(line0, sizeof(line0), "Claim code");
            const size_t codeLen = strlen(s.claimCode);
            // Unsigned arithmetic: a code longer than the panel would wrap
            // LCD_COLS - codeLen to a huge pad width, so centre only when it
            // actually fits and otherwise let printLine clip it.
            const int pad = (codeLen < LCD_COLS) ? static_cast<int>((LCD_COLS - codeLen) / 2) : 0;
            snprintf(line1, sizeof(line1), "%*s%s", pad, "", s.claimCode);
            break;
        }

        case MODE_READING_ONLINE: {
            char left[LCD_COLS + 1];
            snprintf(left, sizeof(left), "Tank %3u%%", percentFull(s));
            padBetween(line0, sizeof(line0), left, glyphs);
            snprintf(line1, sizeof(line1), "%.0fL %.0fcm %.0fC",
                     s.volumeL, s.levelCm, s.temperatureC);
            break;
        }

        // Offline is not an error - the device buffers to flash and uploads on
        // reconnect. Showing the held count says "your data is safe", which is
        // the actual question someone standing at the tank is asking.
        case MODE_READING_OFFLINE: {
            char left[LCD_COLS + 1];
            snprintf(left, sizeof(left), "Tank %3u%%", percentFull(s));
            padBetween(line0, sizeof(line0), left, glyphs);
            // "held 100 readings" would be 17 characters; this ordering fits
            // the full buffer range (MAX_BUFFERED_MEASUREMENTS is 100) in 16.
            const unsigned held = (s.bufferedCount > 999) ? 999 : s.bufferedCount;
            snprintf(line1, sizeof(line1), "%u held offline", held);
            break;
        }

        case MODE_ALERT_LOW: {
            padBetween(line0, sizeof(line0), "! TANK LOW", glyphs);
            snprintf(line1, sizeof(line1), "%.0fL of %.0fL", s.volumeL, s.capacityL);
            break;
        }

        case MODE_ALERT_FULL: {
            padBetween(line0, sizeof(line0), "! TANK FULL", glyphs);
            snprintf(line1, sizeof(line1), "%.0fL of %.0fL", s.volumeL, s.capacityL);
            break;
        }

        case MODE_OTA_PROGRESS: {
            snprintf(line0, sizeof(line0), "Updating %s", s.fwVersion);
            buildProgressBar(line1, sizeof(line1), s.otaPercent);
            break;
        }

        // A disconnected or out-of-range ultrasonic reads as 0cm, which the
        // tank math would happily render as "full". Saying FAULT instead of
        // showing a confident wrong number is the whole reason levelValid
        // exists in the firmware.
        case MODE_SENSOR_FAULT: {
            padBetween(line0, sizeof(line0), "SENSOR FAULT", glyphs);
            snprintf(line1, sizeof(line1), "no echo returned");
            break;
        }

        case MODE_SLEEPING: {
            snprintf(line0, sizeof(line0), "Sleeping");
            unsigned long mins = s.sleepSeconds / 60;
            const unsigned long secs = s.sleepSeconds % 60;
            if (mins > 999) mins = 999;   // bounds the line at exactly 16 chars
            snprintf(line1, sizeof(line1), "wake in %lum%02lus", mins, secs);
            break;
        }

        default: {
            snprintf(line0, sizeof(line0), "unknown screen");
            snprintf(line1, sizeof(line1), "mode=%u", static_cast<unsigned>(s.mode));
            break;
        }
    }

    lcd.printLine(0, line0);
    lcd.printLine(1, line1);

    // The serial mirror is what makes this prototype useful before the panel
    // is even wired: you can review every layout for overflow without an LCD.
    Serial.printf("[%2u] |%-16s|\n", currentScreen, line0);
    Serial.printf("     |%-16s|\n", line1);
}

// ============================================================================
// Fake data
// ============================================================================

static DisplayState fakeStateFor(uint8_t screen) {
    DisplayState s{};
    s.mode          = static_cast<DisplayMode>(screen);
    s.fwVersion     = "1.1.4";
    s.ssid          = "HomeNet-2G";
    s.claimCode     = "8F3K-92QD";
    s.wifiConnected = true;
    s.rssi          = -58;
    s.serverLinkOk  = true;
    s.levelValid    = true;
    s.levelCm       = 42.0f;
    s.volumeL       = 1260.0f;
    s.capacityL     = 1500.0f;
    s.temperatureC  = 24.0f;
    s.bufferedCount = 12;
    s.otaPercent    = 42;
    s.sleepSeconds  = 292;

    // Per-screen overrides, so each demo screen shows the state it represents
    // rather than a healthy device wearing a different label.
    switch (s.mode) {
        case MODE_BOOT:
        case MODE_WIFI_CONNECTING:
        case MODE_PAIRING_PORTAL:
        case MODE_CLAIM_CODE:
            s.wifiConnected = false;
            s.serverLinkOk  = false;
            break;
        case MODE_READING_OFFLINE:
            s.wifiConnected = false;
            s.serverLinkOk  = false;
            break;
        case MODE_ALERT_LOW:
            s.volumeL = 78.0f;
            s.levelCm = 128.0f;
            break;
        case MODE_ALERT_FULL:
            s.volumeL = 1480.0f;
            s.levelCm = 12.0f;
            break;
        case MODE_OTA_PROGRESS:
            s.fwVersion = "1.1.5";
            break;
        case MODE_SENSOR_FAULT:
            s.levelValid = false;
            s.rssi       = -78;   // also exercises the weak-signal glyph
            break;
        case MODE_SLEEPING:
            s.serverLinkOk = false;
            break;
        default:
            break;
    }
    return s;
}

// ============================================================================
// I2C bring-up
// ============================================================================

static void scanBus() {
    Serial.println(F("[I2C] scanning..."));
    uint8_t found = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("[I2C]   device at 0x%02X\n", addr);
            found++;
        }
    }
    if (found == 0) {
        Serial.println(F("[I2C]   nothing responded."));
        Serial.println(F("[I2C]   check: SDA->D7, SCL->D4, GND shared, LCD powered."));
    }
}

// Probes the two common backpack addresses and initialises whichever answers.
static bool bringUpDisplay() {
    for (uint8_t i = 0; i < sizeof(CANDIDATE_ADDRESSES); i++) {
        LcdPcf8574 candidate(CANDIDATE_ADDRESSES[i], LCD_COLS, LCD_ROWS);
        if (candidate.begin()) {
            lcd = candidate;
            Serial.printf("[LCD] backpack found at 0x%02X\n", CANDIDATE_ADDRESSES[i]);
            return true;
        }
    }
    return false;
}

static void loadGlyphs() {
    lcd.createChar(GLYPH_WIFI_WEAK,   BITMAP_WIFI_WEAK);
    lcd.createChar(GLYPH_WIFI_MID,    BITMAP_WIFI_MID);
    lcd.createChar(GLYPH_WIFI_STRONG, BITMAP_WIFI_STRONG);
    lcd.createChar(GLYPH_WIFI_NONE,   BITMAP_WIFI_NONE);
    lcd.createChar(GLYPH_LINK_OK,     BITMAP_LINK_OK);
    // createChar leaves the controller pointing into CGRAM; any DDRAM write
    // must re-address first or the glyphs get overwritten by screen text.
    lcd.setCursor(0, 0);
}

// ============================================================================
// Setup / loop
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println();
    Serial.println(F("=================================================="));
    Serial.println(F("  I2C LCD Display Prototype"));
    Serial.printf ("  SDA=GPIO%d (D7)  SCL=GPIO%d (D4)\n", PIN_LCD_SDA, PIN_LCD_SCL);
    Serial.println(F("=================================================="));

    Wire.begin(PIN_LCD_SDA, PIN_LCD_SCL);
    Wire.setClock(100000);   // 100kHz: HD44780 backpacks are not fast parts
    scanBus();

    lcdReady = bringUpDisplay();
    if (!lcdReady) {
        // Not fatal. The serial mirror still prints every screen, so the
        // layouts can be reviewed and corrected with no panel attached.
        Serial.println(F("[LCD] no backpack at 0x27 or 0x3F."));
        Serial.println(F("[LCD] continuing in serial-only mode."));
    } else {
        loadGlyphs();
        lcd.backlight();
    }

    Serial.println(F("keys: n=next p=prev a=auto s=scan b=backlight"));
    Serial.println(F("      c=contrast blocks  i=re-init the panel  g=glyph sheet"));
    Serial.println();

    lastScreenChange = millis();
    renderScreen(fakeStateFor(currentScreen));
}

static void showScreen(uint8_t screen) {
    currentScreen = screen % MODE__COUNT;
    lastScreenChange = millis();
    renderScreen(fakeStateFor(currentScreen));
}

// ============================================================================
// Hardware diagnostics
//
// begin() returning true only proves the PCF8574 acknowledged its own address.
// The HD44780 behind it is write-only over this backpack - there is no reply
// path - so no amount of software can confirm the glass is actually working.
// The backlight is a separate transistor circuit and lights regardless. These
// two helpers are how you tell "never initialised" from "initialised but
// invisible", which is the only question worth asking when the bus scans clean
// and the screen stays empty.
// ============================================================================

// Fills both rows with solid blocks (character 0xFF) - the most visible thing
// the panel can produce. Turn the contrast pot until they appear, then back it
// off until they just start to fade: that is the usable contrast window.
static void showContrastPattern() {
    if (!lcdReady) {
        Serial.println(F("[diag] no backpack on the bus; nothing to draw"));
        return;
    }
    autoCycle = false;   // otherwise the next cycle tick overwrites the pattern
    for (uint8_t row = 0; row < LCD_ROWS; row++) {
        lcd.setCursor(0, row);
        for (uint8_t col = 0; col < LCD_COLS; col++) lcd.write(0xFF);
    }
    Serial.println(F("[diag] solid blocks written to both rows."));
    Serial.println(F("[diag]   blocks appear      -> contrast found, HD44780 is alive"));
    Serial.println(F("[diag]   blocks at no pot   -> panel wants 5V; 3V3 often cannot"));
    Serial.println(F("[diag]      position           develop contrast on these modules"));
    Serial.println(F("[diag] press 'a' to resume the demo screens."));
}

// Re-runs the HD44780 init sequence on the already-known address. Worth having
// because the controller only accepts its 4-bit init once, at power-up: if the
// panel was plugged in after the ESP8266 booted, or its supply dipped, it
// missed that window and will silently ignore every write until this is redone.
static void reinitDisplay() {
    lcdReady = lcd.begin();
    Serial.printf("[diag] re-init at 0x%02X: %s\n", lcd.address(), lcdReady ? "ACK" : "no ACK");
    if (lcdReady) {
        loadGlyphs();
        lcd.backlight();
        showScreen(currentScreen);
    }
}

// Every glyph side by side with a label under it. Judging a 5x8 bitmap from
// the corner of a status line is hopeless; this puts them in a row so an edit
// can be evaluated in one glance.
static void showGlyphSheet() {
    if (!lcdReady) {
        Serial.println(F("[diag] no backpack on the bus; nothing to draw"));
        return;
    }
    autoCycle = false;
    const uint8_t glyphIds[5] = {
        GLYPH_WIFI_WEAK, GLYPH_WIFI_MID, GLYPH_WIFI_STRONG, GLYPH_WIFI_NONE, GLYPH_LINK_OK
    };
    char row0[LCD_COLS + 1];
    memset(row0, ' ', LCD_COLS);
    row0[LCD_COLS] = '\0';
    for (uint8_t i = 0; i < 5; i++) row0[i * 3] = static_cast<char>(glyphIds[i]);

    lcd.printLine(0, row0);
    lcd.printLine(1, "wk md st no up");
    Serial.println(F("[diag] glyph sheet: weak / mid / strong / none / link-up"));
    Serial.println(F("[diag] press 'a' to resume the demo screens."));
}

static void handleSerial() {
    if (!Serial.available()) return;
    const int c = Serial.read();
    switch (c) {
        case 'n':
            autoCycle = false;
            showScreen(currentScreen + 1);
            break;
        case 'p':
            autoCycle = false;
            showScreen((currentScreen + MODE__COUNT - 1) % MODE__COUNT);
            break;
        case 'a':
            autoCycle = true;
            Serial.println(F("[ui] auto-cycling"));
            break;
        case 's':
            scanBus();
            break;
        case 'c':
            showContrastPattern();
            break;
        case 'i':
            reinitDisplay();
            break;
        case 'g':
            showGlyphSheet();
            break;
        case 'b':
            backlightOn = !backlightOn;
            if (lcdReady) { backlightOn ? lcd.backlight() : lcd.noBacklight(); }
            Serial.printf("[ui] backlight %s\n", backlightOn ? "on" : "off");
            break;
        default:
            break;
    }
}

void loop() {
    handleSerial();

    if (autoCycle && millis() - lastScreenChange >= SCREEN_DWELL_MS) {
        showScreen(currentScreen + 1);
    }

    delay(10);
}

/**
 * ============================================================================
 * LCD Display Prototype  —  ESP8266 (NodeMCU v2)
 * ============================================================================
 * PURPOSE
 *   Bench sketch to validate a 16x2 character LCD driven in 4-BIT PARALLEL
 *   mode (the classic HD44780 wiring: RS, E, D4, D5, D6, D7), plus a single
 *   push button that:
 *     - WAKES the display when it is asleep,
 *     - TOGGLES it back off when it is awake, and
 *     - AUTO-SLEEPS after a period of no button activity (power saving).
 *
 *   "Sleep" here means: blank the characters (lcd.noDisplay) AND cut the
 *   backlight (via BACKLIGHT_PIN + a transistor). That is what actually saves
 *   power — the backlight is the LCD's biggest current draw.
 *
 *   NOTE ON "I2C": this is NOT an I2C LCD. I2C would use only 2 wires
 *   (SDA/SCL) via a PCF8574 backpack and the LiquidCrystal_I2C library. This
 *   sketch matches the 6-wire parallel photo (each LCD data pin on its own
 *   GPIO). If you have an I2C backpack instead, this is the wrong sketch.
 *
 *   Deliberately standalone: NO sensors, WiFi, server, or tank math. Just:
 *   does the panel light up, print, and sleep/wake cleanly on the button?
 *
 * ----------------------------------------------------------------------------
 * WIRING  (NodeMCU label -> LCD pin)      LCD is 16-pin HD44780, 4-bit mode
 * ----------------------------------------------------------------------------
 *   LCD pin 1  VSS  -> GND
 *   LCD pin 2  VDD  -> 5V        (module logic; the module is 5V, see note*)
 *   LCD pin 3  V0   -> 10k pot wiper (contrast). Pot ends to 5V and GND.
 *   LCD pin 4  RS   -> D1  (GPIO5)
 *   LCD pin 5  RW   -> GND       (we only ever write; tie RW low)
 *   LCD pin 6  E    -> D2  (GPIO4)
 *   LCD pin 7  D0   -> (unused in 4-bit mode)
 *   LCD pin 8  D1   -> (unused)
 *   LCD pin 9  D2   -> (unused)
 *   LCD pin 10 D3   -> (unused)
 *   LCD pin 11 D4   -> D5  (GPIO14)
 *   LCD pin 12 D5   -> D6  (GPIO12)
 *   LCD pin 13 D6   -> D0  (GPIO16)
 *   LCD pin 14 D7   -> D8  (GPIO15)   *see boot note below
 *   LCD pin 15 A    -> backlight anode  (through transistor, see BACKLIGHT)
 *   LCD pin 16 K    -> GND              (backlight cathode)
 *
 *   BUTTON:  D7 (GPIO13) --- push button --- GND
 *            Uses INPUT_PULLUP, so the button is active-LOW. No resistor
 *            needed; the internal pull-up holds the pin HIGH until pressed.
 *
 *   BACKLIGHT control (LCD pin 15 "A"):
 *     The backlight can pull ~15-40mA — too much to hang straight off a GPIO.
 *     Drive it through an NPN transistor (or leave it always-on, see below):
 *
 *         D4/GPIO2 --[1k]--|< NPN (e.g. 2N2222/BC547) base
 *                            collector -> LCD pin 15 "A"  (via ~100R if 5V BL)
 *                            emitter   -> GND
 *
 *     Backlight is active-HIGH here (GPIO2 HIGH = lit). GPIO2 is HIGH at boot,
 *     so the backlight comes on at power-up, which is what we want.
 *
 *     Don't want the transistor for a first test? Set BACKLIGHT_PIN to -1 and
 *     tie LCD pin 15 "A" to 5V through a 100-220R resistor. Sleep then only
 *     blanks the characters (lcd.noDisplay); the backlight stays lit.
 *
 * ----------------------------------------------------------------------------
 * *5V vs 3.3V — the ESP8266 gotcha
 * ----------------------------------------------------------------------------
 *   HD44780 modules are 5V parts. Powered at 5V, the LCD's own pins never
 *   drive our GPIOs (RW is tied low, so every LCD data pin is an INPUT — the
 *   ESP only writes). So 5V VDD is safe here even though ESP GPIOs are 3.3V.
 *   The ESP's 3.3V HIGH is above the LCD's logic-HIGH threshold, so it reads
 *   fine. If your panel is dim/garbled at 5V, either use a 3.3V-capable LCD or
 *   power VDD from 5V and keep contrast (V0) tuned with the pot.
 *
 *   GPIO15/D8 (LCD pin 14, "D7 data"): GPIO15 has an on-board pulldown and
 *   must be LOW at boot. An LCD data pin is a high-impedance INPUT, so it does
 *   not fight that pulldown — the board still boots. Fine as an LCD output.
 *
 * ----------------------------------------------------------------------------
 * LIBRARIES:  LiquidCrystal (bundled with the Arduino IDE / arduino-cli core;
 *             works on ESP8266 as long as you pass the Dxx pin macros).
 *
 * FLASH (from firmware/):
 *   arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 prototypes/lcd_display
 *   arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 -p <port> prototypes/lcd_display
 * ============================================================================
 */

#include <LiquidCrystal.h>

// ---- LCD pin map (NodeMCU labels; the Dxx macros resolve to GPIO numbers) --
//                 RS, E,  D4, D5, D6, D7
LiquidCrystal lcd(D1, D2, D5, D6, D0, D8);

// ---- Button + backlight ----------------------------------------------------
const uint8_t BUTTON_PIN    = D7;   // GPIO13, wired to GND, INPUT_PULLUP
const int8_t  BACKLIGHT_PIN = D4;   // GPIO2 via NPN transistor. -1 = no control

// ---- Timing knobs ----------------------------------------------------------
const uint16_t DEBOUNCE_MS   = 30;      // ignore contact bounce within this window
const uint32_t AUTO_SLEEP_MS = 15000;   // blank the display after this idle time
const uint32_t REFRESH_MS    = 1000;    // how often the live line redraws

// ---- Runtime state ---------------------------------------------------------
bool     displayAwake  = true;    // is the panel currently showing anything?
uint32_t lastActivity  = 0;       // millis() of the last wake / button press
uint32_t lastRefresh   = 0;       // millis() of the last content redraw

// Debounce bookkeeping for the active-low button.
int      lastButtonReading = HIGH;    // raw pin level from the previous loop
int      buttonState       = HIGH;    // debounced, settled level
uint32_t lastBounceMs      = 0;       // when the raw level last changed

// ----------------------------------------------------------------------------

void setBacklight(bool on) {
  if (BACKLIGHT_PIN >= 0) digitalWrite(BACKLIGHT_PIN, on ? HIGH : LOW);
}

// Draw the static title row once (used on every wake).
void drawStaticScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("AquaMind LCD");
}

// Redraw only the live second row (uptime), so we don't flicker the title.
void drawLiveLine() {
  uint32_t secs = millis() / 1000;
  lcd.setCursor(0, 1);
  lcd.print("Up: ");
  lcd.print(secs);
  lcd.print("s        ");   // trailing spaces clear leftover digits
}

void wakeDisplay() {
  if (displayAwake) return;
  displayAwake = true;
  setBacklight(true);
  lcd.display();
  drawStaticScreen();
  drawLiveLine();
  lastRefresh = millis();
}

void sleepDisplay() {
  if (!displayAwake) return;
  displayAwake = false;
  lcd.clear();
  lcd.noDisplay();     // blank the characters
  setBacklight(false); // and cut the backlight — this is where the power goes
}

// One button press = toggle. Asleep -> wake, awake -> sleep. Either way the
// idle timer is reset so a fresh wake gets its full AUTO_SLEEP_MS.
void onButtonPress() {
  if (displayAwake) sleepDisplay();
  else              wakeDisplay();
  lastActivity = millis();
}

// Debounced, edge-detected read of the active-low button.
void serviceButton() {
  int reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastBounceMs = millis();          // level changed; start the settle timer
    lastButtonReading = reading;
  }

  if (millis() - lastBounceMs > DEBOUNCE_MS && reading != buttonState) {
    buttonState = reading;            // level has been stable long enough
    if (buttonState == LOW) {         // active-low: LOW == pressed
      onButtonPress();
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("[lcd_display] 16x2 parallel LCD + wake/sleep button");

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  if (BACKLIGHT_PIN >= 0) pinMode(BACKLIGHT_PIN, OUTPUT);

  lcd.begin(16, 2);        // 16 columns, 2 rows
  wakeDisplay();           // start awake, timer running
  lastActivity = millis();
}

void loop() {
  serviceButton();

  if (displayAwake) {
    // Auto-sleep once we've been idle long enough.
    if (millis() - lastActivity > AUTO_SLEEP_MS) {
      sleepDisplay();
      Serial.println("[lcd_display] auto-sleep");
    }
    // Refresh the live line while awake.
    else if (millis() - lastRefresh > REFRESH_MS) {
      drawLiveLine();
      lastRefresh = millis();
    }
  }
}

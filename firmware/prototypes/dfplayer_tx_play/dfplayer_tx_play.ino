/*
 * DFPlayer Mini one-way UART prototype for an ESP8266 NodeMCU.
 *
 * Hardware UART0 TX (GPIO1 / NodeMCU TX) is wired to DFPlayer RX through a
 * 1 kOhm series resistor. DFPlayer TX is deliberately not connected: this
 * sketch neither reads acknowledgements nor playback status.
 *
 * Place a file named 0001.mp3 in the root of a FAT32 microSD card. On boot the
 * module is set to the selected volume and starts that file once.
 *
 * IMPORTANT: UART0 TX is also the USB serial TX pin. Do not use Serial.print
 * in this sketch: every byte would be interpreted as a DFPlayer command.
 */

#ifndef DFPLAYER_VOLUME
#define DFPLAYER_VOLUME 20  // 0 (mute) through 30 (maximum)
#endif

// Set to a non-zero value only when repeatedly testing the same short track.
// This is deliberately timer based because no DFPlayer BUSY or TX pin is read.
#ifndef TEST_REPEAT_INTERVAL_MS
#define TEST_REPEAT_INTERVAL_MS 0UL
#endif

constexpr uint8_t DFPLAYER_TX_PIN = 1;  // GPIO1, NodeMCU pin labelled TX
constexpr uint16_t DFPLAYER_BAUD = 9600;
constexpr uint16_t DFPLAYER_STARTUP_DELAY_MS = 1200;

uint32_t lastPlayAtMs = 0;

// DFPlayer command packet: 7E FF 06 CMD FEEDBACK PARAM_H PARAM_L CHECK_H
// CHECK_L EF. `feedback` is 0, so the unconnected DFPlayer TX pin is fine.
void sendDfPlayerCommand(uint8_t command, uint16_t parameter) {
  const uint8_t version = 0xFF;
  const uint8_t length = 0x06;
  const uint8_t feedback = 0x00;
  const uint8_t parameterHigh = parameter >> 8;
  const uint8_t parameterLow = parameter & 0xFF;
  const uint16_t checksum = static_cast<uint16_t>(
      0U - (version + length + command + feedback + parameterHigh + parameterLow));

  Serial.write(0x7E);
  Serial.write(version);
  Serial.write(length);
  Serial.write(command);
  Serial.write(feedback);
  Serial.write(parameterHigh);
  Serial.write(parameterLow);
  Serial.write(static_cast<uint8_t>(checksum >> 8));
  Serial.write(static_cast<uint8_t>(checksum & 0xFF));
  Serial.write(0xEF);
  Serial.flush();
}

void playRootTrack(uint16_t trackNumber) {
  // 0x03 = play file by its root-directory index. For the first file, use
  // a zero-padded root filename such as /0001.mp3.
  sendDfPlayerCommand(0x03, trackNumber);
  lastPlayAtMs = millis();
}

void setup() {
  // Explicitly selecting TX makes the one-wire intent clear. RX remains
  // unused; Serial.begin still configures the ESP8266 hardware UART normally.
  Serial.begin(DFPLAYER_BAUD, SERIAL_8N1, SERIAL_TX_ONLY, DFPLAYER_TX_PIN);
  delay(DFPLAYER_STARTUP_DELAY_MS);  // let the DFPlayer enumerate its microSD

  sendDfPlayerCommand(0x06, DFPLAYER_VOLUME);  // 0x06 = set volume (0..30)
  delay(100);
  playRootTrack(1);
}

void loop() {
#if TEST_REPEAT_INTERVAL_MS > 0
  if (millis() - lastPlayAtMs >= TEST_REPEAT_INTERVAL_MS) {
    playRootTrack(1);
  }
#endif
}

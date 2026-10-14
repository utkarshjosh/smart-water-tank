/**
 * ============================================================================
 * Minimal HD44780-over-PCF8574 driver  (I2C character LCD backpack)
 * ============================================================================
 * Deliberately dependency-free: only <Wire.h> from the ESP8266 core. No
 * LiquidCrystal_I2C to install, pin, or vendor - which matters because this
 * file is meant to graduate into firmware/src/water_tank/ as the real display
 * module once the bench circuit is proven.
 *
 * Backpack bit mapping (the near-universal "blue PCF8574 backpack" layout):
 *
 *   P0 -> RS      (0 = command, 1 = character data)
 *   P1 -> RW      (held 0; we only ever write)
 *   P2 -> E       (enable strobe, latches on the falling edge)
 *   P3 -> BL      (backlight transistor gate, 1 = lit)
 *   P4 -> D4  \
 *   P5 -> D5   |  the 4-bit data bus; every byte goes out as
 *   P6 -> D6   |  high nibble first, then low nibble
 *   P7 -> D7  /
 *
 * If your backpack is one of the rarer wirings (some boards swap RS and E, or
 * put the data bus on P0-P3), characters come out as garbage rather than
 * nothing at all - that is the symptom to look for.
 * ============================================================================
 */

#ifndef LCD_PCF8574_H
#define LCD_PCF8574_H

#include <Arduino.h>
#include <Wire.h>

class LcdPcf8574 {
public:
    LcdPcf8574(uint8_t address, uint8_t cols, uint8_t rows)
        : addr_(address), cols_(cols), rows_(rows), backlight_(LCD_BACKLIGHT) {}

    // Returns false if the backpack does not ACK its address - i.e. wrong
    // address, or SDA/SCL not actually reaching the module. Distinguishing
    // "not on the bus" from "on the bus but showing nothing" (a contrast pot
    // problem) is the single most useful thing this driver reports.
    bool begin() {
        Wire.beginTransmission(addr_);
        if (Wire.endTransmission() != 0) return false;

        // HD44780 power-on: the controller may be in 8-bit mode, in 4-bit
        // mode, or mid-byte. This sequence lands it in a known 4-bit state
        // from any of the three. The delays are from the datasheet.
        delay(50);
        writeRaw(backlight_);   // everything low except backlight
        delay(100);

        writeNibble(0x30); delayMicroseconds(4500);
        writeNibble(0x30); delayMicroseconds(4500);
        writeNibble(0x30); delayMicroseconds(150);
        writeNibble(0x20);      // now actually in 4-bit mode

        command(0x28);          // function set: 4-bit, 2 lines, 5x8 font
        command(0x08);          // display off
        clear();
        command(0x06);          // entry mode: increment cursor, no shift
        display();
        return true;
    }

    void clear() { command(0x01); delayMicroseconds(2000); }
    void home()  { command(0x02); delayMicroseconds(2000); }

    void display()   { ctrl_ |= 0x04; command(0x08 | ctrl_); }
    void noDisplay() { ctrl_ &= ~0x04; command(0x08 | ctrl_); }
    void cursor()    { ctrl_ |= 0x02; command(0x08 | ctrl_); }
    void noCursor()  { ctrl_ &= ~0x02; command(0x08 | ctrl_); }
    void blink()     { ctrl_ |= 0x01; command(0x08 | ctrl_); }
    void noBlink()   { ctrl_ &= ~0x01; command(0x08 | ctrl_); }

    void backlight()   { backlight_ = LCD_BACKLIGHT; writeRaw(backlight_); }
    void noBacklight() { backlight_ = 0x00;          writeRaw(backlight_); }

    void setCursor(uint8_t col, uint8_t row) {
        // DDRAM start address per row. A 16x2 panel only uses the first two,
        // but 20x4 panels are the same controller with these four offsets.
        static const uint8_t rowOffset[4] = {0x00, 0x40, 0x14, 0x54};
        if (row >= rows_) row = rows_ - 1;
        command(0x80 | (col + rowOffset[row]));
    }

    void write(uint8_t value) { send(value, RS_DATA); }

    void print(const char* s) { while (*s) write(static_cast<uint8_t>(*s++)); }
    void print(const String& s) { print(s.c_str()); }

    // Writes exactly cols_ characters: pads short text with spaces so a line
    // never keeps leftovers from whatever was there before. Without this,
    // "1260L" overwriting "12604L" leaves a stray '4' on screen forever.
    void printLine(uint8_t row, const char* s) {
        setCursor(0, row);
        uint8_t written = 0;
        while (*s && written < cols_) { write(static_cast<uint8_t>(*s++)); written++; }
        while (written < cols_) { write(' '); written++; }
    }

    void printLine(uint8_t row, const String& s) { printLine(row, s.c_str()); }

    // Loads one of the 8 user-definable glyphs (slots 0-7) from an 8-byte
    // bitmap, 5 bits wide. Used for the WiFi bars and tank icon.
    void createChar(uint8_t slot, const uint8_t bitmap[8]) {
        command(0x40 | ((slot & 0x07) << 3));
        for (uint8_t i = 0; i < 8; i++) write(bitmap[i]);
    }

    uint8_t address() const { return addr_; }

private:
    static const uint8_t LCD_BACKLIGHT = 0x08;
    static const uint8_t EN_BIT        = 0x04;
    static const uint8_t RS_DATA       = 0x01;
    static const uint8_t RS_COMMAND    = 0x00;

    void command(uint8_t value) { send(value, RS_COMMAND); }

    void send(uint8_t value, uint8_t mode) {
        writeNibble((value & 0xF0) | mode);
        writeNibble(((value << 4) & 0xF0) | mode);
    }

    // One nibble = set the data lines, then pulse E high-then-low. The
    // controller latches on E's falling edge.
    void writeNibble(uint8_t nibble) {
        writeRaw(nibble | backlight_);
        writeRaw(nibble | backlight_ | EN_BIT);
        delayMicroseconds(1);
        writeRaw(nibble | backlight_);
        delayMicroseconds(50);
    }

    void writeRaw(uint8_t bits) {
        Wire.beginTransmission(addr_);
        Wire.write(bits);
        Wire.endTransmission();
    }

    uint8_t addr_;
    uint8_t cols_;
    uint8_t rows_;
    uint8_t backlight_;
    uint8_t ctrl_ = 0x00;
};

#endif // LCD_PCF8574_H

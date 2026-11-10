# ESP8266 Water Tank Monitoring System - Hardware Schematics

This directory contains SKiDL schematics for the ESP8266-based water tank monitoring system.

## Files

- `generate_netlist.py` - **RECOMMENDED**: Simple text-based netlist generator (works without any dependencies)
- `esp8266_schematic.py` - Full schematic with PAM8403 amplifier (requires KiCad libraries)
- `esp8266_schematic_simple.py` - Simplified schematic (requires KiCad libraries)
- `esp8266_schematic_standalone.py` - Standalone version (requires KiCad libraries)
- `esp8266_schematic_working.py` - Alternative version (requires KiCad libraries)

**Note**: The SKiDL-based schematics (`esp8266_schematic*.py`) require KiCad to be installed and configured with proper library paths. If you encounter library errors, use `generate_netlist.py` instead, which works without any dependencies.

## Components Required

### Core Components
- **ESP8266 NodeMCU** (or similar development board)
- **DS18B20 Waterproof Temperature Sensor** (with 4.7k pull-up resistor)
- **Waterproof Ultrasonic Sensor** (HC-SR04 or JSN-SR04T recommended)
- **Passive Buzzer** (or active buzzer/speaker)
- **Status LED** (220Ω current limiting resistor)
- **Battery Voltage Divider** (100k/100k resistors for 2:1 ratio)

### Optional Components
- **PAM8403 Audio Amplifier** (for louder alerts with speaker)
- **Reverse Polarity Protection Diode** (1N5819 Schottky)
- **Power Decoupling Capacitors** (100µF, 10µF, 100nF)
- **Reset/Flash Buttons** (usually built into NodeMCU)

## Pin Configuration

Based on `firmware/src/modules/config.h`:

| Component | ESP8266 Pin | GPIO | Description |
|-----------|-------------|------|-------------|
| Temperature Sensor | D3 | GPIO0 | OneWire data line |
| Ultrasonic TRIG | D1 | GPIO5 | Trigger output |
| Ultrasonic ECHO | D2 | GPIO4 | Echo input |
| Buzzer/Speaker | D5 | GPIO14 | Audio output |
| Status LED | Built-in | GPIO16 | Status indicator |
| Battery ADC | A0 | ADC0 | Voltage divider input |

## Installation

### Option 1: Simple Netlist Generator (Recommended - No Dependencies)

The simplest way to get a wiring reference:

```bash
cd firmware/hardware
python3 generate_netlist.py
```

This generates `esp8266_water_tank_netlist.txt` with a complete wiring reference that doesn't require any external libraries.

### Option 2: SKiDL Schematic (Requires Full KiCad Setup)

**⚠️ Warning**: SKiDL schematics require KiCad to be installed with proper library configuration. If you don't have KiCad set up, use Option 1 instead.

If you have KiCad installed and want to generate a KiCad-compatible netlist:

1. Install KiCad and SKiDL:
```bash
# Install KiCad (varies by OS)
# Ubuntu/Debian:
sudo apt-get install kicad

# Install SKiDL:
pip install skidl
```

2. Set up KiCad environment variables:
```bash
# Find your KiCad installation path, then:
export KICAD_SYMBOL_DIR=/usr/share/kicad/symbols
# Or for KiCad 6/7/8:
export KICAD6_SYMBOL_DIR=/usr/share/kicad/symbols
export KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols
export KICAD8_SYMBOL_DIR=/usr/share/kicad/symbols
```

3. Run the schematic generator:
```bash
cd firmware/hardware
python3 esp8266_schematic_simple.py
```

**Troubleshooting**: If you get library errors, SKiDL cannot find KiCad's symbol libraries. Either:
- Install and configure KiCad properly, OR
- Use `generate_netlist.py` which doesn't require KiCad

## Using in KiCad

1. Open KiCad
2. Create a new project or open existing one
3. Open the schematic editor
4. Go to **Tools -> Load Netlist**
5. Select the generated `.net` file
6. The components and connections will be imported

## Wiring Diagram (Breadboard)

### Temperature Sensor (DS18B20)
```
DS18B20          ESP8266 NodeMCU
--------         ----------------
Red (VDD)   -->  3.3V
Black (GND) -->  GND
Yellow (DQ) -->  D3 (GPIO0)
                 |
                 +--[4.7kΩ]---> 3.3V (pull-up)
```

### Ultrasonic Sensor (HC-SR04 or JSN-SR04T)
```
Ultrasonic        ESP8266 NodeMCU
-----------       ----------------
VCC          -->  5V
GND          -->  GND
Trig         -->  D1 (GPIO5)
Echo         -->  D2 (GPIO4)
```

### Buzzer
```
Buzzer            ESP8266 NodeMCU
------            ----------------
+             -->  D5 (GPIO14)
-             -->  GND
```

### Battery Monitoring
```
Battery           Voltage Divider        ESP8266 NodeMCU
------            ----------------       ----------------
+             --> [100kΩ] --+-- [100kΩ] -->  GND
                            |
                            +------------>  A0 (ADC0)
-             -->  GND
```

### Status LED
```
LED               ESP8266 NodeMCU
---               ----------------
Anode (+)    -->  [220Ω] --> GPIO16 (built-in LED)
Cathode (-)  -->  GND
```

## Power Supply

- **Primary**: USB 5V (via NodeMCU USB port)
- **Backup**: External battery (3.7V Li-ion or 12V lead-acid)
  - For 12V battery, adjust voltage divider ratio (use 100k/10k for ~11:1)

## Notes

1. **Waterproof Ultrasonic Sensor**: Current devices use the JSN-SR04T. It has the same pinout as HC-SR04 but is IP65 rated. It cannot measure anything nearer than about 20-25 cm, so it must be mounted with the full water line at least 25-30 cm below the sensor face. **Future devices should use the A02YYUW instead** - see [Sensor choice for future devices](#sensor-choice-for-future-devices).

2. **Voltage Divider**: The ESP8266 ADC has a maximum input of 1V. The 100k/100k divider provides a 2:1 ratio, allowing monitoring of up to 2V. For higher battery voltages, adjust the ratio accordingly.

3. **OneWire Pull-up**: The DS18B20 requires a 4.7kΩ pull-up resistor on the data line. This is critical for proper communication.

4. **5V Tolerance**: **ESP8266 GPIO pins are NOT 5V tolerant.** This is a persistent and widespread myth; Espressif's datasheet puts the absolute maximum input at 3.6V, and the NodeMCU carrier board adds no tolerance of its own. The ultrasonic module is powered from 5V and drives ECHO to nearly 5V, so **the divider on ECHO is mandatory, not optional** (see WIRING_DIAGRAM.md). Without it the pin's ESD protection diodes degrade slowly — the board keeps working for months, then one day the pin does not come back.

5. **Power Consumption**: For battery-powered operation, consider:
   - Using deep sleep between measurements
   - Disabling WiFi when not transmitting
   - Using a low-power buzzer or speaker

## Sensor choice for future devices

**Use the A02YYUW (DFRobot SEN0311) on new devices, not the JSN-SR04T.**

Why: the JSN-SR04T is blind to anything nearer than about 20-25 cm. On the first tank in the field the water at full sat nearer than that, and the sensor reported distances that were too large and jumped around. The app showed up to 250 L of "use" in an hour that never happened, and three rounds of software filters could not fix it, because a wrong reading that drifts smoothly looks exactly like real use. The A02YYUW's blind zone is 3 cm, so a sensor mounted in the lid sees the water all the way to a normal full line.

| | JSN-SR04T (current) | A02YYUW (future) |
|---|---|---|
| Blind zone | about 20-25 cm | 3 cm |
| Range | to about 4-6 m | 3-450 cm |
| Output | TRIG/ECHO pulse | UART, 9600 baud |
| Resolution as we read it | whole cm | 1 mm |
| Supply | 5 V | 3.3-5 V |
| Rating | IP65 | IP67 |

What changes when a device is built with it:

- **Firmware**: it is a serial device, not trigger/echo, so the NewPing code in `src/water_tank/sensor.cpp` does not apply. It needs one receive pin and a frame reader (SoftwareSerial on the ESP8266). Take the frame format from the datasheet.
- **Readings**: it reports millimetres. Sending them as they are removes today's whole-centimetre steps, where one step is 12.7 L on a pair of 90 cm tanks.
- **Wiring**: run it from 3.3 V and check on the bench whether the 5 V ECHO divider is still needed. It should not be.
- **Tank setup in the app**: set "Nearest distance the sensor can measure" to the new blind zone (about 3-5 cm) instead of 25 cm.

Until then, a JSN-SR04T install is only sound when the full water line is 25-30 cm or more from the sensor face. The app's tank setup warns when the measured full line is nearer than the sensor can see.

## Troubleshooting

- **Temperature sensor not reading**: Check the 4.7kΩ pull-up resistor is connected
- **Ultrasonic sensor not working**: Verify 5V power supply and check echo pin voltage levels. If the ECHO divider is built backwards (2k in series, 1k to GND) the pin sees 1.67V, which is under the ESP8266's ~2.5V HIGH threshold — the sensor then reads as completely dead rather than merely inaccurate.
- **Battery reading incorrect**: Verify voltage divider resistor values match your battery voltage
- **Buzzer not working**: Check if using active vs passive buzzer (wiring differs)

## References

- [SKiDL Documentation](https://xess.com/skidl/docs/)
- [ESP8266 Pin Reference](https://randomnerdtutorials.com/esp8266-pinout-reference-gpios/)
- [DS18B20 Datasheet](https://datasheets.maximintegrated.com/en/ds/DS18B20.pdf)
- [HC-SR04 Datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf)


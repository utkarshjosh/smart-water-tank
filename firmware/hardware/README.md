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

1. **Waterproof Ultrasonic Sensor**: The JSN-SR04T is recommended for outdoor/waterproof applications. It has the same pinout as HC-SR04 but is IP65 rated.

2. **Voltage Divider**: The ESP8266 ADC has a maximum input of 1V. The 100k/100k divider provides a 2:1 ratio, allowing monitoring of up to 2V. For higher battery voltages, adjust the ratio accordingly.

3. **OneWire Pull-up**: The DS18B20 requires a 4.7kΩ pull-up resistor on the data line. This is critical for proper communication.

4. **5V Tolerance**: Most NodeMCU boards have 5V-tolerant GPIO pins, but the ultrasonic echo pin may benefit from a voltage divider for safety.

5. **Power Consumption**: For battery-powered operation, consider:
   - Using deep sleep between measurements
   - Disabling WiFi when not transmitting
   - Using a low-power buzzer or speaker

## Troubleshooting

- **Temperature sensor not reading**: Check the 4.7kΩ pull-up resistor is connected
- **Ultrasonic sensor not working**: Verify 5V power supply and check echo pin voltage levels
- **Battery reading incorrect**: Verify voltage divider resistor values match your battery voltage
- **Buzzer not working**: Check if using active vs passive buzzer (wiring differs)

## References

- [SKiDL Documentation](https://xess.com/skidl/docs/)
- [ESP8266 Pin Reference](https://randomnerdtutorials.com/esp8266-pinout-reference-gpios/)
- [DS18B20 Datasheet](https://datasheets.maximintegrated.com/en/ds/DS18B20.pdf)
- [HC-SR04 Datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf)


#!/usr/bin/env python3
"""
SKiDL Schematic for ESP8266 Water Tank Monitoring System

This schematic includes:
- ESP8266 (NodeMCU or similar)
- DS18B20 Temperature Sensor
- Waterproof Ultrasonic Sensor (HC-SR04 or similar)
- Speaker/Buzzer with optional PAM8403 amplifier
- Battery voltage monitoring (voltage divider)
- Status LED
- Power supply components

To generate the netlist:
    python esp8266_schematic.py

To generate a KiCad schematic:
    python esp8266_schematic.py
    Then import the netlist into KiCad
"""

from skidl import *

# Set the library search path
lib_search_paths[KICAD].append('.')

# ============================================================================
# Power Supply Section
# ============================================================================

# Power input (5V USB or external supply)
vcc_5v = Net('VCC_5V')
gnd = Net('GND')

# 3.3V regulator for ESP8266 (if not using NodeMCU with built-in regulator)
# For NodeMCU, this is already on board, but we'll include it for standalone ESP8266
# vreg = Part('power', 'LM1117-3.3', footprint='TO-220-3_Vertical')
# vreg['VI'] += vcc_5v
# vreg['GND'] += gnd
# vcc_3v3 = Net('VCC_3V3')
# vreg['VO'] += vcc_3v3

# For NodeMCU, VCC_3V3 is available on board
vcc_3v3 = Net('VCC_3V3')

# Power decoupling capacitors
c1 = Part('device', 'C', value='100uF', footprint='Capacitor_THT:D_D5.0mm_H10.0mm')
c2 = Part('device', 'C', value='10uF', footprint='Capacitor_THT:D_D5.0mm_H10.0mm')
c3 = Part('device', 'C', value='100nF', footprint='Capacitor_THT:C_Disc_D3.0mm_W1.6mm_P2.50mm')
c1[1] += vcc_5v
c1[2] += gnd
c2[1] += vcc_3v3
c2[2] += gnd
c3[1] += vcc_3v3
c3[2] += gnd

# ============================================================================
# ESP8266 Module (NodeMCU or similar)
# ============================================================================

# ESP8266 NodeMCU module
esp8266 = Part('MCU_Module', 'ESP8266-12E_Module', footprint='Module:ESP8266-12E_Module')
esp8266['VCC'] += vcc_3v3
esp8266['GND'] += gnd
esp8266['EN'] += vcc_3v3  # Enable pin pulled high

# GPIO pins
gpio0 = Net('GPIO0')  # D3 - Temperature sensor
gpio4 = Net('GPIO4')  # D2 - Ultrasonic ECHO
gpio5 = Net('GPIO5')  # D1 - Ultrasonic TRIG
gpio14 = Net('GPIO14')  # D5 - Speaker/Buzzer
gpio16 = Net('GPIO16')  # Status LED (built-in)
adc0 = Net('ADC0')  # A0 - Battery voltage divider

esp8266['GPIO0'] += gpio0
esp8266['GPIO4'] += gpio4
esp8266['GPIO5'] += gpio5
esp8266['GPIO14'] += gpio14
esp8266['GPIO16'] += gpio16
esp8266['ADC'] += adc0

# ============================================================================
# DS18B20 Temperature Sensor
# ============================================================================

# DS18B20 waterproof temperature sensor
ds18b20 = Part('Sensor_Temperature', 'DS18B20', footprint='Package_TO_SOT_THT:TO-92_Inline')
ds18b20['VDD'] += vcc_3v3
ds18b20['GND'] += gnd
ds18b20['DQ'] += gpio0  # OneWire data line

# Pull-up resistor for OneWire bus (4.7k recommended)
r1 = Part('device', 'R', value='4.7k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')
r1[1] += vcc_3v3
r1[2] += gpio0

# ============================================================================
# Waterproof Ultrasonic Sensor (HC-SR04 or similar)
# ============================================================================

# Ultrasonic sensor module
ultrasonic = Part('Sensor_Distance', 'HC-SR04', footprint='Sensor_Distance:HC-SR04')
ultrasonic['VCC'] += vcc_5v  # HC-SR04 typically needs 5V
ultrasonic['GND'] += gnd
ultrasonic['Trig'] += gpio5  # Trigger pin
ultrasonic['Echo'] += gpio4  # Echo pin

# Optional: Level shifter if using 3.3V ESP8266 with 5V ultrasonic
# For NodeMCU, GPIO pins are 5V tolerant, but echo might need level shifting
# Using a simple voltage divider for echo pin (if needed)
r2 = Part('device', 'R', value='10k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')
r3 = Part('device', 'R', value='20k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')
echo_divided = Net('ECHO_DIVIDED')
ultrasonic['Echo'] += r2[1]
r2[2] += echo_divided
r3[1] += echo_divided
r3[2] += gnd
gpio4 += echo_divided

# ============================================================================
# Speaker/Buzzer with Amplifier
# ============================================================================

# PAM8403 Class-D amplifier (optional, for louder alerts)
pam8403 = Part('Amplifier_Audio', 'PAM8403', footprint='Package_SO:SOIC-16_3.9x9.9mm_P1.27mm')
pam8403['VDD'] += vcc_5v
pam8403['GND'] += gnd
pam8403['SD'] += vcc_5v  # Shutdown pin (high = enabled)

# Audio input from ESP8266
audio_in = Net('AUDIO_IN')
pam8403['INL+'] += audio_in
pam8403['INL-'] += gnd
pam8403['INR+'] += audio_in
pam8403['INR-'] += gnd

# Coupling capacitor for audio input
c4 = Part('device', 'C', value='10uF', footprint='Capacitor_THT:D_D5.0mm_H10.0mm')
c4[1] += gpio14
c4[2] += audio_in

# Speaker (8 ohm)
speaker = Part('device', 'Speaker', footprint='Audio:Speaker_8ohm')
speaker['+'] += pam8403['OUTL+']
speaker['-'] += pam8403['OUTL-']
# For mono, connect both channels or use one

# Alternative: Simple buzzer (if not using amplifier)
# buzzer = Part('device', 'Buzzer', footprint='Buzzer_Beeper:Buzzer_12x9.5')
# buzzer['+'] += gpio14
# buzzer['-'] += gnd

# ============================================================================
# Battery Voltage Monitoring
# ============================================================================

# Voltage divider for battery monitoring (ESP8266 ADC max 1V, so divide by 2)
# Using 100k/100k divider for 2:1 ratio
r4 = Part('device', 'R', value='100k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')
r5 = Part('device', 'R', value='100k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')

# Battery input (connect to battery positive, typically 3.7V Li-ion or 12V lead-acid)
battery_plus = Net('BATTERY_PLUS')
battery_plus += r4[1]
r4[2] += adc0
r5[1] += adc0
r5[2] += gnd

# Optional: Schottky diode for reverse polarity protection
d1 = Part('device', 'D', value='1N5819', footprint='Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal')
d1['A'] += battery_plus
d1['K'] += Net('BATTERY_PROTECTED')
# Connect BATTERY_PROTECTED to r4[1] instead of battery_plus if using diode

# ============================================================================
# Status LED
# ============================================================================

# Built-in LED on NodeMCU (GPIO16)
# External status LED (optional)
led = Part('device', 'LED', footprint='LED_THT:LED_D5.0mm')
r6 = Part('device', 'R', value='220', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')
r6[1] += gpio16
r6[2] += led['A']
led['K'] += gnd

# ============================================================================
# Additional Components
# ============================================================================

# Reset button (optional, for manual reset)
reset_btn = Part('switch', 'SW_PUSH', footprint='Button_Switch_THT:SW_PUSH_6mm')
reset_btn[1] += esp8266['RST']
reset_btn[2] += gnd

# Flash button (for programming mode)
flash_btn = Part('switch', 'SW_PUSH', footprint='Button_Switch_THT:SW_PUSH_6mm')
flash_btn[1] += esp8266['GPIO0']
flash_btn[2] += gnd

# ============================================================================
# Connectors
# ============================================================================

# Power input connector
power_conn = Part('Connector_Generic', 'Conn_01x02', footprint='Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical')
power_conn[1] += vcc_5v
power_conn[2] += gnd

# Battery connector
battery_conn = Part('Connector_Generic', 'Conn_01x02', footprint='Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical')
battery_conn[1] += battery_plus
battery_conn[2] += gnd

# ============================================================================
# Generate Netlist
# ============================================================================

if __name__ == '__main__':
    # Generate the netlist
    generate_netlist(file_='esp8266_water_tank.net')
    print("Netlist generated: esp8266_water_tank.net")
    print("\nSchematic Summary:")
    print(f"- ESP8266 Module: {esp8266}")
    print(f"- Temperature Sensor: {ds18b20}")
    print(f"- Ultrasonic Sensor: {ultrasonic}")
    print(f"- Audio Amplifier: {pam8403}")
    print(f"- Speaker: {speaker}")
    print(f"- Status LED: {led}")
    print(f"- Power Supply: 5V input, 3.3V regulated")
    print(f"- Battery Monitoring: Voltage divider on ADC")





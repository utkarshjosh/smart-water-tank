#!/usr/bin/env python3
"""
SKiDL Schematic for ESP8266 Water Tank Monitoring System (Simplified Version)

⚠️  IMPORTANT: This script requires KiCad to be installed and configured with
    proper library paths. If you encounter library errors, use the simple
    netlist generator instead:
    
    python3 generate_netlist.py
    
    That script works without any dependencies and provides the same information.

This is a simplified, more practical schematic that uses standard components
and is easier to build on a breadboard or PCB.

Components:
- ESP8266 NodeMCU (or similar development board)
- DS18B20 Waterproof Temperature Sensor
- HC-SR04 Waterproof Ultrasonic Sensor (or JSN-SR04T)
- Passive Buzzer or Speaker
- Battery voltage divider
- Status LED
- Power supply

Requirements:
    - KiCad installed with symbol libraries
    - Environment variables set (KICAD_SYMBOL_DIR or KICAD6_SYMBOL_DIR, etc.)
    - SKiDL installed: pip install skidl

Usage:
    python3 esp8266_schematic_simple.py
"""

from skidl import *

# ⚠️  NOTE: This script requires KiCad libraries to be available.
#    If you get "Can't open file: device" errors, KiCad is not properly configured.
#    Use generate_netlist.py instead for a working solution without dependencies.

set_default_tool(KICAD)

# Suppress library warnings (but errors will still occur if libraries are missing)
import logging
logging.getLogger('skidl').setLevel(logging.ERROR)

# ============================================================================
# Power Supply
# ============================================================================

vcc_5v = Net('VCC_5V')  # 5V power supply (USB or external)
vcc_3v3 = Net('VCC_3V3')  # 3.3V for ESP8266 (from NodeMCU regulator)
gnd = Net('GND')  # Ground

# Power decoupling capacitors
# Using generic capacitor parts
try:
    c_vcc = Part('device', 'C', value='100uF')
except:
    c_vcc = Part(lib='', name='C', dest=TEMPLATE, value='100uF')
c_vcc[1] += vcc_5v
c_vcc[2] += gnd

try:
    c_3v3 = Part('device', 'C', value='10uF')
except:
    c_3v3 = Part(lib='', name='C', dest=TEMPLATE, value='10uF')
c_3v3[1] += vcc_3v3
c_3v3[2] += gnd

# ============================================================================
# ESP8266 NodeMCU Module
# ============================================================================

# Note: In practice, you'd use a NodeMCU or similar board
# For schematic purposes, we'll define the connections

# GPIO pins as nets
gpio0 = Net('GPIO0')   # D3 - Temperature sensor (OneWire)
gpio4 = Net('GPIO4')   # D2 - Ultrasonic ECHO
gpio5 = Net('GPIO5')   # D1 - Ultrasonic TRIG
gpio14 = Net('GPIO14') # D5 - Buzzer/Speaker
gpio16 = Net('GPIO16') # Status LED (built-in on NodeMCU)
adc0 = Net('ADC0')     # A0 - Battery voltage divider

# ============================================================================
# DS18B20 Temperature Sensor
# ============================================================================

# DS18B20 waterproof temperature sensor
# Pinout: Red=VDD, Black=GND, Yellow/White=DQ (data)
try:
    temp_sensor = Part('Sensor_Temperature', 'DS18B20')
except:
    # Create generic 3-pin sensor if library not available
    temp_sensor = Part(lib='', name='DS18B20', dest=TEMPLATE, pins=[
        Pin(name='VDD', num=1, func=Pin.PWRIN),
        Pin(name='GND', num=2, func=Pin.PWRIN),
        Pin(name='DQ', num=3, func=Pin.BIDIR)
    ])
temp_sensor['VDD'] += vcc_3v3
temp_sensor['GND'] += gnd
temp_sensor['DQ'] += gpio0

# 4.7k pull-up resistor for OneWire bus
try:
    r_pullup = Part('device', 'R', value='4.7k')
except:
    r_pullup = Part(lib='', name='R', dest=TEMPLATE, value='4.7k', pins=[Pin(num=1), Pin(num=2)])
r_pullup[1] += vcc_3v3
r_pullup[2] += gpio0

# ============================================================================
# Waterproof Ultrasonic Sensor
# ============================================================================

# HC-SR04 or JSN-SR04T waterproof ultrasonic sensor
# JSN-SR04T is recommended for waterproof applications
try:
    ultrasonic = Part('Sensor_Distance', 'HC-SR04')
except:
    # Create generic 4-pin ultrasonic sensor
    ultrasonic = Part(lib='', name='HC-SR04', dest=TEMPLATE, pins=[
        Pin(name='VCC', num=1, func=Pin.PWRIN),
        Pin(name='GND', num=2, func=Pin.PWRIN),
        Pin(name='Trig', num=3, func=Pin.INPUT),
        Pin(name='Echo', num=4, func=Pin.OUTPUT)
    ])

# Power connections
ultrasonic['VCC'] += vcc_5v  # HC-SR04 needs 5V
ultrasonic['GND'] += gnd

# Control connections
ultrasonic['Trig'] += gpio5  # Trigger pin (output from ESP8266)
ultrasonic['Echo'] += gpio4  # Echo pin (input to ESP8266)

# Note: If using JSN-SR04T (waterproof version), it typically has:
# - VCC (red)
# - GND (black)  
# - Trig (yellow)
# - Echo (green)

# Optional: Voltage divider for echo pin if ESP8266 is not 5V tolerant
# Most NodeMCU boards are 5V tolerant, but for safety:
try:
    r_echo_1 = Part('device', 'R', value='10k')
    r_echo_2 = Part('device', 'R', value='20k')
except:
    r_echo_1 = Part(lib='', name='R', dest=TEMPLATE, value='10k', pins=[Pin(num=1), Pin(num=2)])
    r_echo_2 = Part(lib='', name='R', dest=TEMPLATE, value='20k', pins=[Pin(num=1), Pin(num=2)])
echo_mid = Net('ECHO_MID')
ultrasonic['Echo'] += r_echo_1[1]
r_echo_1[2] += echo_mid
r_echo_2[1] += echo_mid
r_echo_2[2] += gnd
gpio4 += echo_mid

# ============================================================================
# Buzzer/Speaker
# ============================================================================

# Option 1: Passive buzzer (simpler, lower power)
try:
    buzzer = Part('device', 'Buzzer')
except:
    buzzer = Part(lib='', name='Buzzer', dest=TEMPLATE, pins=[
        Pin(name='+', num=1),
        Pin(name='-', num=2)
    ])
buzzer['+'] += gpio14
buzzer['-'] += gnd

# Option 2: Active buzzer (has built-in oscillator)
# active_buzzer = Part('device', 'Buzzer_Active', footprint='Buzzer_Beeper:Buzzer_12x9.5')
# active_buzzer['+'] += vcc_3v3
# active_buzzer['-'] += gpio14  # Control via GPIO

# Option 3: Speaker with amplifier (for louder alerts)
# See the full schematic for PAM8403 amplifier option

# ============================================================================
# Battery Voltage Monitoring
# ============================================================================

# Voltage divider for battery monitoring
# ESP8266 ADC max input is 1V, so we divide by 2 using 100k/100k resistors
# This allows monitoring up to 2V, or use different ratio for higher voltages

# For 3.7V Li-ion battery (monitor up to ~7.4V with 2:1 divider):
try:
    r_batt_1 = Part('device', 'R', value='100k')
    r_batt_2 = Part('device', 'R', value='100k')
except:
    r_batt_1 = Part(lib='', name='R', dest=TEMPLATE, value='100k', pins=[Pin(num=1), Pin(num=2)])
    r_batt_2 = Part(lib='', name='R', dest=TEMPLATE, value='100k', pins=[Pin(num=1), Pin(num=2)])

# For 12V lead-acid battery, use different ratio (e.g., 100k/10k for ~11:1):
# r_batt_1 = Part('device', 'R', value='100k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')
# r_batt_2 = Part('device', 'R', value='10k', footprint='Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P1.27mm')

battery_plus = Net('BATTERY_PLUS')
battery_plus += r_batt_1[1]
r_batt_1[2] += adc0
r_batt_2[1] += adc0
r_batt_2[2] += gnd

# Optional: Reverse polarity protection diode
try:
    d_protect = Part('device', 'D', value='1N5819')
except:
    d_protect = Part(lib='', name='D', dest=TEMPLATE, value='1N5819', pins=[
        Pin(name='A', num=1),
        Pin(name='K', num=2)
    ])
d_protect['A'] += battery_plus
batt_protected = Net('BATTERY_PROTECTED')
d_protect['K'] += batt_protected
# Connect r_batt_1[1] to batt_protected instead of battery_plus if using diode

# ============================================================================
# Status LED
# ============================================================================

# External status LED (optional, NodeMCU has built-in LED on GPIO16)
try:
    led = Part('device', 'LED')
    r_led = Part('device', 'R', value='220')
except:
    led = Part(lib='', name='LED', dest=TEMPLATE, pins=[
        Pin(name='A', num=1),
        Pin(name='K', num=2)
    ])
    r_led = Part(lib='', name='R', dest=TEMPLATE, value='220', pins=[Pin(num=1), Pin(num=2)])
r_led[1] += gpio16
r_led[2] += led['A']
led['K'] += gnd

# ============================================================================
# Optional: Reset and Flash Buttons
# ============================================================================

# Reset button (optional - NodeMCU has built-in reset)
# reset_btn = Part('switch', 'SW_PUSH', footprint='Button_Switch_THT:SW_PUSH_6mm')
# reset_btn[1] += Net('RST')
# reset_btn[2] += gnd

# Flash button (for programming - NodeMCU has built-in)
# flash_btn = Part('switch', 'SW_PUSH', footprint='Button_Switch_THT:SW_PUSH_6mm')
# flash_btn[1] += gpio0
# flash_btn[2] += gnd

# ============================================================================
# Connectors
# ============================================================================

# Power input (USB or external 5V)
try:
    power_header = Part('Connector_Generic', 'Conn_01x02')
except:
    power_header = Part(lib='', name='Conn_01x02', dest=TEMPLATE, pins=[Pin(num=1), Pin(num=2)])
power_header[1] += vcc_5v
power_header[2] += gnd

# Battery connector
try:
    battery_header = Part('Connector_Generic', 'Conn_01x02')
except:
    battery_header = Part(lib='', name='Conn_01x02', dest=TEMPLATE, pins=[Pin(num=1), Pin(num=2)])
battery_header[1] += battery_plus
battery_header[2] += gnd

# ============================================================================
# Generate Netlist
# ============================================================================

if __name__ == '__main__':
    # Generate netlist
    generate_netlist(file_='esp8266_water_tank_simple.net')
    
    print("=" * 70)
    print("ESP8266 Water Tank Monitoring System - Schematic")
    print("=" * 70)
    print("\nComponents:")
    print(f"  - Temperature Sensor: {temp_sensor.name} (DS18B20)")
    print(f"  - Ultrasonic Sensor: {ultrasonic.name} (HC-SR04/JSN-SR04T)")
    print(f"  - Buzzer: {buzzer.name}")
    print(f"  - Status LED: {led.name}")
    print(f"  - Battery Monitoring: Voltage divider (100k/100k)")
    print("\nPin Connections:")
    print(f"  - GPIO0 (D3): Temperature sensor (OneWire)")
    print(f"  - GPIO4 (D2): Ultrasonic ECHO")
    print(f"  - GPIO5 (D1): Ultrasonic TRIG")
    print(f"  - GPIO14 (D5): Buzzer")
    print(f"  - GPIO16: Status LED")
    print(f"  - ADC0 (A0): Battery voltage divider")
    print("\nNetlist generated: esp8266_water_tank_simple.net")
    print("\nTo use in KiCad:")
    print("  1. Open KiCad")
    print("  2. Import netlist: Tools -> Load Netlist")
    print("  3. Select the generated .net file")
    print("=" * 70)


#!/usr/bin/env python3
"""
SKiDL Schematic for ESP8266 Water Tank Monitoring System (Standalone Version)

This version works without requiring KiCad to be installed.
It generates a netlist that can be used for reference or imported into KiCad later.

Usage:
    pip install skidl
    python esp8266_schematic_standalone.py
"""

from skidl import *

# Suppress library warnings
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# Helper function to create generic parts
# ============================================================================

def create_resistor(value):
    """Create a generic resistor."""
    r = Part(lib='', name='R', dest=TEMPLATE, value=value)
    r.add_pins(Pin(num=1), Pin(num=2))
    return r

def create_capacitor(value):
    """Create a generic capacitor."""
    c = Part(lib='', name='C', dest=TEMPLATE, value=value)
    c.add_pins(Pin(num=1), Pin(num=2))
    return c

def create_led():
    """Create a generic LED."""
    led = Part(lib='', name='LED', dest=TEMPLATE)
    led.add_pins(Pin(name='A', num=1), Pin(name='K', num=2))
    return led

def create_buzzer():
    """Create a generic buzzer."""
    buzzer = Part(lib='', name='Buzzer', dest=TEMPLATE)
    buzzer.add_pins(Pin(name='+', num=1), Pin(name='-', num=2))
    return buzzer

def create_diode(value):
    """Create a generic diode."""
    d = Part(lib='', name='D', dest=TEMPLATE, value=value)
    d.add_pins(Pin(name='A', num=1), Pin(name='K', num=2))
    return d

def create_connector(pins=2):
    """Create a generic connector."""
    conn = Part(lib='', name=f'Conn_01x{pins:02d}', dest=TEMPLATE)
    for i in range(1, pins + 1):
        conn.add_pins(Pin(num=i))
    return conn

# ============================================================================
# Power Supply
# ============================================================================

vcc_5v = Net('VCC_5V')  # 5V power supply (USB or external)
vcc_3v3 = Net('VCC_3V3')  # 3.3V for ESP8266 (from NodeMCU regulator)
gnd = Net('GND')  # Ground

# Power decoupling capacitors
c_vcc = create_capacitor('100uF')
c_vcc[1] += vcc_5v
c_vcc[2] += gnd

c_3v3 = create_capacitor('10uF')
c_3v3[1] += vcc_3v3
c_3v3[2] += gnd

# ============================================================================
# ESP8266 NodeMCU Module
# ============================================================================

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
temp_sensor = Part(lib='', name='DS18B20', dest=TEMPLATE)
temp_sensor.add_pins(
    Pin(name='VDD', num=1, func=Pin.PWRIN),
    Pin(name='GND', num=2, func=Pin.PWRIN),
    Pin(name='DQ', num=3, func=Pin.BIDIR)
)
temp_sensor['VDD'] += vcc_3v3
temp_sensor['GND'] += gnd
temp_sensor['DQ'] += gpio0

# 4.7k pull-up resistor for OneWire bus
r_pullup = create_resistor('4.7k')
r_pullup[1] += vcc_3v3
r_pullup[2] += gpio0

# ============================================================================
# Waterproof Ultrasonic Sensor
# ============================================================================

# HC-SR04 or JSN-SR04T waterproof ultrasonic sensor
ultrasonic = Part(lib='', name='HC-SR04', dest=TEMPLATE)
ultrasonic.add_pins(
    Pin(name='VCC', num=1, func=Pin.PWRIN),
    Pin(name='GND', num=2, func=Pin.PWRIN),
    Pin(name='Trig', num=3, func=Pin.INPUT),
    Pin(name='Echo', num=4, func=Pin.OUTPUT)
)

# Power connections
ultrasonic['VCC'] += vcc_5v  # HC-SR04 needs 5V
ultrasonic['GND'] += gnd

# Control connections
ultrasonic['Trig'] += gpio5  # Trigger pin (output from ESP8266)
ultrasonic['Echo'] += gpio4  # Echo pin (input to ESP8266)

# Optional: Voltage divider for echo pin if ESP8266 is not 5V tolerant
# Most NodeMCU boards are 5V tolerant, but for safety:
r_echo_1 = create_resistor('10k')
r_echo_2 = create_resistor('20k')
echo_mid = Net('ECHO_MID')
ultrasonic['Echo'] += r_echo_1[1]
r_echo_1[2] += echo_mid
r_echo_2[1] += echo_mid
r_echo_2[2] += gnd
gpio4 += echo_mid

# ============================================================================
# Buzzer/Speaker
# ============================================================================

# Passive buzzer (simpler, lower power)
buzzer = create_buzzer()
buzzer['+'] += gpio14
buzzer['-'] += gnd

# ============================================================================
# Battery Voltage Monitoring
# ============================================================================

# Voltage divider for battery monitoring
# ESP8266 ADC max input is 1V, so we divide by 2 using 100k/100k resistors
r_batt_1 = create_resistor('100k')
r_batt_2 = create_resistor('100k')

battery_plus = Net('BATTERY_PLUS')
battery_plus += r_batt_1[1]
r_batt_1[2] += adc0
r_batt_2[1] += adc0
r_batt_2[2] += gnd

# Optional: Reverse polarity protection diode
d_protect = create_diode('1N5819')
d_protect['A'] += battery_plus
batt_protected = Net('BATTERY_PROTECTED')
d_protect['K'] += batt_protected
# Note: Connect r_batt_1[1] to batt_protected instead of battery_plus if using diode

# ============================================================================
# Status LED
# ============================================================================

# External status LED (optional, NodeMCU has built-in LED on GPIO16)
led = create_led()
r_led = create_resistor('220')
r_led[1] += gpio16
r_led[2] += led['A']
led['K'] += gnd

# ============================================================================
# Connectors
# ============================================================================

# Power input (USB or external 5V)
power_header = create_connector(2)
power_header[1] += vcc_5v
power_header[2] += gnd

# Battery connector
battery_header = create_connector(2)
battery_header[1] += battery_plus
battery_header[2] += gnd

# ============================================================================
# Generate Netlist
# ============================================================================

if __name__ == '__main__':
    # Generate netlist
    generate_netlist(file_='esp8266_water_tank.net')
    
    print("=" * 70)
    print("ESP8266 Water Tank Monitoring System - Schematic")
    print("=" * 70)
    print("\nComponents:")
    print(f"  - Temperature Sensor: DS18B20")
    print(f"  - Ultrasonic Sensor: HC-SR04/JSN-SR04T")
    print(f"  - Buzzer: Passive buzzer")
    print(f"  - Status LED: LED with 220Ω resistor")
    print(f"  - Battery Monitoring: Voltage divider (100k/100k)")
    print("\nPin Connections:")
    print(f"  - GPIO0 (D3): Temperature sensor (OneWire)")
    print(f"  - GPIO4 (D2): Ultrasonic ECHO")
    print(f"  - GPIO5 (D1): Ultrasonic TRIG")
    print(f"  - GPIO14 (D5): Buzzer")
    print(f"  - GPIO16: Status LED")
    print(f"  - ADC0 (A0): Battery voltage divider")
    print("\nNetlist generated: esp8266_water_tank.net")
    print("\nThis netlist can be:")
    print("  1. Used as a reference for wiring")
    print("  2. Imported into KiCad (if KiCad is installed)")
    print("  3. Converted to other formats")
    print("=" * 70)






#!/usr/bin/env python3
"""
SKiDL Schematic for ESP8266 Water Tank Monitoring System (Working Version)

This version uses SKiDL's backup library mechanism to work without KiCad libraries.
It will generate a netlist that can be used for reference.

Usage:
    pip install skidl
    python3 esp8266_schematic_working.py
"""

from skidl import *

# Suppress library warnings
import warnings
warnings.filterwarnings('ignore')

# Use backup library if KiCad libraries aren't available
# This allows the schematic to work without KiCad installed

# ============================================================================
# Power Supply
# ============================================================================

vcc_5v = Net('VCC_5V')  # 5V power supply (USB or external)
vcc_3v3 = Net('VCC_3V3')  # 3.3V for ESP8266 (from NodeMCU regulator)
gnd = Net('GND')  # Ground

# Power decoupling capacitors
# Using backup library mechanism
c_vcc = Part('', 'C', value='100uF', footprint='', dest=TEMPLATE)
c_vcc.add_pins(Pin(num=1), Pin(num=2))
c_vcc = c_vcc()
c_vcc[1] += vcc_5v
c_vcc[2] += gnd

c_3v3 = Part('', 'C', value='10uF', footprint='', dest=TEMPLATE)
c_3v3.add_pins(Pin(num=1), Pin(num=2))
c_3v3 = c_3v3()
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
temp_sensor = Part('', 'DS18B20', dest=TEMPLATE)
temp_sensor.add_pins(
    Pin(name='VDD', num=1, func=Pin.PWRIN),
    Pin(name='GND', num=2, func=Pin.PWRIN),
    Pin(name='DQ', num=3, func=Pin.BIDIR)
)
temp_sensor = temp_sensor()
temp_sensor['VDD'] += vcc_3v3
temp_sensor['GND'] += gnd
temp_sensor['DQ'] += gpio0

# 4.7k pull-up resistor for OneWire bus
r_pullup = Part('', 'R', value='4.7k', dest=TEMPLATE)
r_pullup.add_pins(Pin(num=1), Pin(num=2))
r_pullup = r_pullup()
r_pullup[1] += vcc_3v3
r_pullup[2] += gpio0

# ============================================================================
# Waterproof Ultrasonic Sensor
# ============================================================================

# HC-SR04 or JSN-SR04T waterproof ultrasonic sensor
ultrasonic = Part('', 'HC-SR04', dest=TEMPLATE)
ultrasonic.add_pins(
    Pin(name='VCC', num=1, func=Pin.PWRIN),
    Pin(name='GND', num=2, func=Pin.PWRIN),
    Pin(name='Trig', num=3, func=Pin.INPUT),
    Pin(name='Echo', num=4, func=Pin.OUTPUT)
)
ultrasonic = ultrasonic()

# Power connections
ultrasonic['VCC'] += vcc_5v  # HC-SR04 needs 5V
ultrasonic['GND'] += gnd

# Control connections
ultrasonic['Trig'] += gpio5  # Trigger pin (output from ESP8266)
ultrasonic['Echo'] += gpio4  # Echo pin (input to ESP8266)

# Optional: Voltage divider for echo pin if ESP8266 is not 5V tolerant
r_echo_1 = Part('', 'R', value='10k', dest=TEMPLATE)
r_echo_1.add_pins(Pin(num=1), Pin(num=2))
r_echo_1 = r_echo_1()

r_echo_2 = Part('', 'R', value='20k', dest=TEMPLATE)
r_echo_2.add_pins(Pin(num=1), Pin(num=2))
r_echo_2 = r_echo_2()

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
buzzer = Part('', 'Buzzer', dest=TEMPLATE)
buzzer.add_pins(Pin(name='+', num=1), Pin(name='-', num=2))
buzzer = buzzer()
buzzer['+'] += gpio14
buzzer['-'] += gnd

# ============================================================================
# Battery Voltage Monitoring
# ============================================================================

# Voltage divider for battery monitoring
r_batt_1 = Part('', 'R', value='100k', dest=TEMPLATE)
r_batt_1.add_pins(Pin(num=1), Pin(num=2))
r_batt_1 = r_batt_1()

r_batt_2 = Part('', 'R', value='100k', dest=TEMPLATE)
r_batt_2.add_pins(Pin(num=1), Pin(num=2))
r_batt_2 = r_batt_2()

battery_plus = Net('BATTERY_PLUS')
battery_plus += r_batt_1[1]
r_batt_1[2] += adc0
r_batt_2[1] += adc0
r_batt_2[2] += gnd

# Optional: Reverse polarity protection diode
d_protect = Part('', 'D', value='1N5819', dest=TEMPLATE)
d_protect.add_pins(Pin(name='A', num=1), Pin(name='K', num=2))
d_protect = d_protect()
d_protect['A'] += battery_plus
batt_protected = Net('BATTERY_PROTECTED')
d_protect['K'] += batt_protected

# ============================================================================
# Status LED
# ============================================================================

# External status LED (optional, NodeMCU has built-in LED on GPIO16)
led = Part('', 'LED', dest=TEMPLATE)
led.add_pins(Pin(name='A', num=1), Pin(name='K', num=2))
led = led()

r_led = Part('', 'R', value='220', dest=TEMPLATE)
r_led.add_pins(Pin(num=1), Pin(num=2))
r_led = r_led()

r_led[1] += gpio16
r_led[2] += led['A']
led['K'] += gnd

# ============================================================================
# Connectors
# ============================================================================

# Power input (USB or external 5V)
power_header = Part('', 'Conn_01x02', dest=TEMPLATE)
power_header.add_pins(Pin(num=1), Pin(num=2))
power_header = power_header()
power_header[1] += vcc_5v
power_header[2] += gnd

# Battery connector
battery_header = Part('', 'Conn_01x02', dest=TEMPLATE)
battery_header.add_pins(Pin(num=1), Pin(num=2))
battery_header = battery_header()
battery_header[1] += battery_plus
battery_header[2] += gnd

# ============================================================================
# Generate Netlist
# ============================================================================

if __name__ == '__main__':
    try:
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
        print("=" * 70)
    except Exception as e:
        print(f"Error generating netlist: {e}")
        print("\nNote: This schematic uses generic parts.")
        print("For a working reference, use: python3 generate_netlist.py")






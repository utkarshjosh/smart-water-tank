# ESP8266 Water Tank Monitoring - Wiring Diagram

## Complete Wiring Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESP8266 NodeMCU                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  USB Port (5V Power)                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐      │
│  │D0 │  │D1 │  │D2 │  │D3 │  │D4 │  │D5 │  │D6 │  │D7 │      │
│  └───┘  └───┘  └───┘  └───┘  └───┘  └───┘  └───┘  └───┘      │
│   GPIO16 GPIO5 GPIO4 GPIO0 GPIO2 GPIO14 GPIO12 GPIO13          │
│                                                                  │
│  ┌───┐                                                          │
│  │A0 │  (ADC Input)                                             │
│  └───┘                                                          │
│                                                                  │
│  3.3V ────────────────────────────────────────────────────────┐ │
│  GND  ────────────────────────────────────────────────────────┐ │
│  5V    ────────────────────────────────────────────────────────┐ │
└─────────────────────────────────────────────────────────────────┘
         │              │              │              │
         │              │              │              │
         │              │              │              │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │         │   │         │   │         │   │         │
    │ DS18B20 │   │ HC-SR04 │   │ Buzzer  │   │ Battery │
    │  Temp   │   │Ultrasonic│   │         │   │ Monitor │
    │         │   │         │   │         │   │         │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

## Component-by-Component Wiring

### 1. DS18B20 Temperature Sensor

```
DS18B20 (Waterproof)
┌─────────────────┐
│                 │
│  Red   (VDD)    │───┐
│  Black (GND)    │───┤
│  Yellow (DQ)    │───┤
│                 │   │
└─────────────────┘   │
                      │
                      │
         ┌────────────┴────────────┐
         │                         │
         │                         │
    ┌────▼────┐              ┌────▼────┐
    │  3.3V   │              │   D3     │
    │ NodeMCU │              │ (GPIO0)  │
    └─────────┘              └──────────┘
         │                         │
         │                         │
         └──────[4.7kΩ]────────────┘
                    │
                    │
                ┌───▼───┐
                │  GND  │
                └───────┘
```

### 2. HC-SR04 / JSN-SR04T Ultrasonic Sensor

```
Ultrasonic Sensor (Waterproof)
┌──────────────────────┐
│                      │
│  VCC  (Red)          │───┐
│  GND  (Black)        │───┤
│  Trig (Yellow)       │───┤
│  Echo (Green)        │───┤
│                      │   │
└──────────────────────┘   │
                            │
         ┌──────────────────┴──────────────────┐
         │                                      │
    ┌────▼────┐                           ┌────▼────┐
    │   5V    │                           │   D1    │
    │ NodeMCU │                           │(GPIO5)  │
    └─────────┘                           └─────────┘
         │                                      │
    ┌────▼────┐                           ┌────▼────┐
    │  GND    │                           │   D2    │
    │ NodeMCU │                           │(GPIO4)  │
    └─────────┘                           └─────────┘
```

**Required Voltage Divider for Echo:**

The module runs on 5V and drives ECHO to nearly 5V. ESP8266 GPIOs are **not**
5V tolerant (3.6V absolute maximum), so this divider is mandatory — it is the
only thing standing between the sensor and GPIO4.

```
Echo Pin ──[1kΩ]──┬──[2kΩ]── GND
                  │
                  └── D2 (GPIO4)
```

5V × 2/(1+2) = **3.33V** at the pin. 10k/20k gives the same ratio and works,
but 1k/2k is the better pick here: a third of the impedance means faster edges
and better noise rejection, and ECHO is a timing signal on a long cable running
into a tank.

> **Order matters.** Series resistor on the ECHO side, larger resistor to GND,
> GPIO on the tap. Built the other way round (2k series, 1k to GND) the pin
> sees 1.67V — below the ~2.5V HIGH threshold — and the sensor reads as dead.

**TRIG needs no divider and must not have one.** TRIG is an *input* on the
module: the ESP drives 3.3V into it and nothing is ever pushed back at the
GPIO, so there is no overvoltage to divide. Adding one would drop the trigger
pulse below the module's threshold and stop it firing.

### 3. Buzzer / Speaker

```
Passive Buzzer
┌─────────────┐
│             │
│  +          │───┐
│  -          │───┤
│             │   │
└─────────────┘   │
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐       ┌────▼────┐
    │   D5    │       │  GND    │
    │(GPIO14) │       │ NodeMCU │
    └─────────┘       └─────────┘
```

**With PAM8403 Amplifier (Optional):**
```
D5 (GPIO14) ──[10µF]── PAM8403 INL+
                          │
PAM8403 OUTL+ ────────────┴─── Speaker +
PAM8403 OUTL- ──────────────── Speaker -
                          │
                       GND ─── GND
```

### 4. Battery Voltage Monitoring

```
Battery (3.7V Li-ion or 12V Lead-acid)
┌─────────────┐
│             │
│  +          │───┐
│  -          │───┤
│             │   │
└─────────────┘   │
                  │
         ┌────────┴────────┐
         │                  │
    ┌────▼────┐        ┌────▼────┐
    │ [100kΩ] │        │ [100kΩ] │
    └────┬────┘        └────┬────┘
         │                  │
         └────────┬─────────┘
                  │
              ┌───▼───┐
              │  A0   │
              │(ADC0) │
              └───────┘
                  │
              ┌───▼───┐
              │  GND  │
              └───────┘
```

**For 12V Battery (adjust ratio):**
```
Battery + ──[100kΩ]──┬──[10kΩ]── GND
                     │
                     └── A0 (ADC0)
```

### 5. Status LED

```
Status LED
┌─────────┐
│         │
│  +      │───┐
│  -      │───┤
│         │   │
└─────────┘   │
              │
     ┌────────┴────────┐
     │                 │
┌────▼────┐       ┌────▼────┐
│ [220Ω]  │       │  GND    │
└────┬────┘       └─────────┘
     │
┌────▼────┐
│ GPIO16  │
│(Built-in│
│  LED)   │
└─────────┘
```

## Complete Breadboard Layout

```
                    Power Rails
    ┌─────────────────────────────────────────┐
    │  +5V  │  +3.3V │  GND  │  GND  │  GND  │
    └─────────────────────────────────────────┘
         │      │      │      │      │
         │      │      │      │      │
    ┌────┴──────┴──────┴──────┴──────┴──────┐
    │                                        │
    │  [ESP8266 NodeMCU]                     │
    │                                        │
    │  D1 ────────────────────┐             │
    │  D2 ────────────────────┤             │
    │  D3 ────────────────────┤             │
    │  D5 ────────────────────┤             │
    │  A0 ────────────────────┤             │
    │  3.3V ──────────────────┤             │
    │  5V ────────────────────┤             │
    │  GND ───────────────────┤             │
    │                                        │
    └────────────────────────────────────────┘
         │      │      │      │      │
         │      │      │      │      │
    ┌────▼──────▼──────▼──────▼──────▼──────┐
    │                                        │
    │  [DS18B20]    [HC-SR04]   [Buzzer]    │
    │                                        │
    │  VDD─3.3V     VCC─5V      +─D5        │
    │  GND─GND      GND─GND     -─GND       │
    │  DQ─D3        Trig─D1                 │
    │              Echo─D2                 │
    │                                        │
    │  [4.7kΩ]      [Voltage Divider]       │
    │  3.3V─DQ       Battery+─[100k]─A0     │
    │                [100k]─GND             │
    │                                        │
    └────────────────────────────────────────┘
```

## Power Supply Options

### Option 1: USB Power (Primary)
```
USB Cable ──> NodeMCU USB Port ──> 5V/3.3V Regulated
```

### Option 2: External 5V Supply
```
5V Adapter ──> NodeMCU VIN Pin ──> 5V/3.3V Regulated
```

### Option 3: Battery Backup
```
Battery ──> Voltage Divider ──> A0 (Monitoring)
         └─> Optional: Charge Controller ──> NodeMCU VIN
```

## Component Placement Tips

1. **Temperature Sensor**: Mount DS18B20 sensor in a location where it can measure water temperature accurately (submerged or in contact with tank wall).

2. **Ultrasonic Sensor**: Mount waterproof ultrasonic sensor (JSN-SR04T) above the tank, pointing down. Ensure it's protected from direct weather but has clear line of sight to water surface.

3. **Buzzer**: Place buzzer in a location where alerts can be heard. For outdoor installations, consider a weatherproof enclosure.

4. **Battery**: If using battery backup, place in a weatherproof enclosure. Use appropriate battery chemistry for temperature range.

5. **NodeMCU**: Keep in a weatherproof enclosure (IP65 or better) with proper ventilation to prevent condensation.

## Safety Notes

- ⚠️ **Waterproofing**: Ensure all connections are properly sealed if exposed to moisture
- ⚠️ **Voltage Levels**: ESP8266 GPIO pins are 3.3V and are **NOT 5V tolerant** — the datasheet absolute maximum is 3.6V, and NodeMCU adds no tolerance. Any 5V-powered part driving a signal *into* a GPIO needs level shifting: a two-resistor divider for a one-way line like ultrasonic ECHO, or a BSS138 MOSFET shifter for a bidirectional open-drain bus like I2C, where a passive divider would break the pull-down
- ⚠️ **Current Limits**: GPIO pins can source ~12mA max. Use transistors/MOSFETs for higher current devices
- ⚠️ **Power Supply**: Ensure adequate power supply capacity (NodeMCU + sensors + buzzer)
- ⚠️ **Grounding**: Use common ground for all components
- ⚠️ **Reverse Polarity**: Consider adding protection diode for battery connections






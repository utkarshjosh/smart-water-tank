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

**Optional Voltage Divider for Echo (if needed):**
```
Echo Pin ──[10kΩ]──┬──[20kΩ]── GND
                   │
                   └── D2 (GPIO4)
```

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
- ⚠️ **Voltage Levels**: ESP8266 GPIO pins are 3.3V. Most NodeMCU boards are 5V tolerant, but verify your specific board
- ⚠️ **Current Limits**: GPIO pins can source ~12mA max. Use transistors/MOSFETs for higher current devices
- ⚠️ **Power Supply**: Ensure adequate power supply capacity (NodeMCU + sensors + buzzer)
- ⚠️ **Grounding**: Use common ground for all components
- ⚠️ **Reverse Polarity**: Consider adding protection diode for battery connections




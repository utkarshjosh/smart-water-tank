# Sensor Calibration Guide

---

## 1️⃣ Fix the Mounting First (This Matters More Than Code)

### Critical Mounting Requirements

- ✅ **Sensor must point straight down**
- ✅ **No obstruction** within its cone (wires, tank lid ribs, inlet pipe, etc.)
- ✅ Keep the sensor face at least **25–30 cm above max water** with the JSN-SR04T. Nearer than about 20–25 cm it cannot see the water and reports wrong distances. (The A02YYUW planned for future devices needs only about 3–5 cm - see `firmware/hardware/README.md`.)
- ✅ Ideally center it over the tank, or the flattest region of water

> **Important:** Only after mounting should you calibrate — not before.

---

## 2️⃣ Measure Two Reference Distances Manually

### What You Need

| State | What to Measure | Use |
|-------|----------------|-----|
| **Empty tank** | Measure distance from sensor face → bottom floor | This is `tank_depth_mm` |
| **Full tank (safe max)** | Measure distance from sensor face → full water surface | This is `full_distance_mm` |

> Use a **steel tape** for accuracy.

### Example

```
Tank depth          = 1240mm
Distance when full  = 60mm
```

✅ You now have a calibration baseline.

---

## 3️⃣ Take Multiple Sensor Readings in Each State

### Process

- Take **10–20 readings** for **EMPTY** and **FULL**, and store the average.

### Why?

Ultrasonic readings fluctuate slightly because of:
- Air temperature
- Reflections
- Other environmental factors

### Store These Values

- `raw_full_avg`
- `raw_empty_avg`

✅ These become your calibration anchors.

---

## 4️⃣ Create a Linear Mapping

### Conversion Formula

Since the sensor gives distance from itself → water, convert it:

```
water_height = tank_empty_distance - sensor_distance
```

### Compute Percentage

```
percent_full = (water_height / tank_depth) * 100
```

### Example Calculation

```
sensor_distance now: 320mm
water_height = 1240 - 320 = 920mm
percent_full = (920 / 1240) * 100 ≈ 74%
```

---

## 5️⃣ Add Filtering to Make Readings Stable

### Filtering Options

Use one (or combine):

- ✅ **Moving Average Filter**
- ✅ **Exponential Filtering**
- ✅ **Median Filter** (great when pump causes ripples)

### Example: Simple Moving Average

```cpp
const int sampleCount = 10;
float getFilteredDistance() {
  float sum = 0;
  for(int i = 0; i < sampleCount; i++) {
    sum += getUltrasonicReading();
    delay(50);
  }
  return sum / sampleCount;
}
```

---

## 6️⃣ (Optional but Ideal) Temperature Compensation

### Why?

Speed of sound changes with temperature:

```
speed_of_sound = 331 + 0.6 * temp_c
```

This affects accuracy by **1–2%**.

### Implementation

- If you're logging with ESP32, add a cheap **DS18B20 temperature sensor** near the ultrasonic sensor
- Then correct distance:

```
corrected_distance = (measured_distance * speed_of_sound) / 343
```

---

## 7️⃣ Validity Guardrails

### Force Readings into Logical Limits

```cpp
if(distance < full_distance_mm) use full_distance_mm
if(distance > tank_depth_mm) use tank_depth_mm
```

> This prevents spikes from giving nonsense values like **200% full**.

---

## 8️⃣ Save Calibration Values in EEPROM/Flash

> So you calibrate once and never redo unless you move/install again.

---

## 🔍 Final Calibration Flow Summary

✅ **Install perfectly**  
✅ **Measure empty & full distances**  
✅ **Record real values + sensor averages for each**  
✅ **Map linear relationship**  
✅ **Apply filtering & optional temperature correction**  
✅ **Store calibration constants**

---

## Quick Reference Checklist

- [ ] Sensor mounted correctly (straight down, no obstructions)
- [ ] Measured empty tank distance manually
- [ ] Measured full tank distance manually
- [ ] Taken 10-20 readings for empty state (calculated average)
- [ ] Taken 10-20 readings for full state (calculated average)
- [ ] Implemented linear mapping formula
- [ ] Added filtering (moving average/median)
- [ ] (Optional) Added temperature compensation
- [ ] Implemented validity guardrails
- [ ] Saved calibration values to EEPROM/Flash

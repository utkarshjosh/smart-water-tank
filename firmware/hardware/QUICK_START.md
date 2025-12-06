# Quick Start - ESP8266 Water Tank Schematic

## ✅ Recommended: Simple Netlist Generator

**Works immediately, no setup required!**

```bash
cd firmware/hardware
python3 generate_netlist.py
```

This creates `esp8266_water_tank_netlist.txt` with:
- Complete component list
- All pin connections
- Wiring diagrams
- Component values and notes

**No dependencies needed** - just Python 3!

## ⚠️ SKiDL Schematics (Requires KiCad)

The SKiDL-based schematics (`esp8266_schematic*.py`) require:
- KiCad installed
- KiCad symbol libraries configured
- Environment variables set

If you see errors like:
```
ERROR: Can't open file: device.
ValueError: Can't make a part without a library & part name
```

**Solution**: Use `generate_netlist.py` instead - it provides the same information!

## What's the Difference?

| Feature | generate_netlist.py | SKiDL schematics |
|---------|---------------------|-----------------|
| Dependencies | None (just Python) | KiCad + SKiDL |
| Setup time | 0 seconds | 10-30 minutes |
| Output format | Text file | KiCad netlist |
| Use case | Wiring reference | PCB design |
| Works offline | ✅ Yes | ✅ Yes |

## Recommendation

**99% of users**: Use `generate_netlist.py` - it's perfect for:
- Understanding the circuit
- Breadboard wiring
- Documentation
- Reference for PCB design

**PCB designers**: Set up KiCad and use SKiDL, or manually create schematic using the netlist as reference.

## Files Generated

- `esp8266_water_tank_netlist.txt` - Complete wiring reference (from generate_netlist.py)
- `esp8266_water_tank.net` - KiCad netlist (from SKiDL, if KiCad is set up)

Both contain the same information, just in different formats!





# Quick Start Guide

## Recommended: Simple Netlist Generator

The easiest way to get a wiring reference is to use the simple netlist generator:

```bash
cd firmware/hardware
python3 generate_netlist.py
```

This will create `esp8266_water_tank_netlist.txt` with complete wiring information. **No dependencies required!**

## SKiDL Schematics (Advanced)

The SKiDL-based schematics (`esp8266_schematic*.py`) require:
1. KiCad installed on your system
2. KiCad symbol libraries properly configured
3. Environment variables set for KiCad library paths

If you don't have KiCad set up, you'll get errors like:
```
ERROR: Can't open file: device.
ValueError: Can't make a part without a library & part name or a part definition.
```

**Solution**: Use `generate_netlist.py` instead, which provides the same information without requiring KiCad.

## What You Get

Both approaches provide:
- Complete component list
- Pin connection table
- Net connections
- Wiring notes and recommendations

The text netlist from `generate_netlist.py` is perfect for:
- Breadboard wiring
- PCB design reference
- Understanding the circuit
- Documentation

The SKiDL netlist (if KiCad is set up) can be:
- Imported into KiCad for schematic editing
- Used for PCB layout
- Exported to other formats

## Recommendation

**For most users**: Use `generate_netlist.py` - it's simpler and works immediately.

**For PCB design**: Set up KiCad and use the SKiDL schematics, or manually create a schematic in KiCad using the netlist as reference.






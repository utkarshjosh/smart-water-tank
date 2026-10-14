# DFPlayer Mini one-way TX prototype (ESP8266)

This is a deliberately small bench sketch: a NodeMCU sends commands from its
hardware **TX** pin to a DFPlayer Mini. There is no return connection from the
DFPlayer, so the ESP cannot ask whether the card mounted, the file exists, or
the track finished. It plays `/0001.mp3` once after each boot.

It uses the serial protocol directly rather than adding a DFPlayer library. In
particular, each packet requests **no feedback**, which makes the unconnected
DFPlayer `TX` pin intentional.

## Wire it first without the external amplifier

Start by proving the module with the 8-ohm speaker connected directly to the
DFPlayer. Do **not** use the PAM amplifier at this stage.

| NodeMCU | Component pin | Part / note |
|---|---|---|
| `TX` / GPIO1 | DFPlayer `RX` | put **1 kOhm in series**, close to the DFPlayer |
| GND | DFPlayer GND | shared ground is required |
| regulated 5V | DFPlayer VCC | use a supply with adequate transient current |
| DFPlayer `SPK1` | speaker terminal 1 | direct-speaker test only |
| DFPlayer `SPK2` | speaker terminal 2 | direct-speaker test only |

Leave DFPlayer `TX`, `BUSY`, `DAC_L`, and `DAC_R` unconnected for that direct
speaker test. `SPK1`/`SPK2` are a bridge-tied output: **neither is ground**.
Never connect either to GND or to the PAM amplifier input.

The NodeMCU shares this UART pin with USB serial. This sketch therefore sends
no serial logs; a `Serial.print()` would inject garbage into the DFPlayer.
ESP8266 boot messages can also briefly appear on this pin before the sketch
starts, which is harmless after the DFPlayer has had its startup delay.

## microSD card

1. Format a known-good card as FAT32 (small cards are usually least fussy).
2. Put one test file in the card root and name it exactly `0001.mp3`.
3. Insert the card before powering the DFPlayer.
4. Flash the sketch, then power-cycle it. It waits 1.2 seconds, sets volume
   20/30, and requests root track 1.

From `firmware/`:

```bash
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 prototypes/dfplayer_tx_play
arduino-cli upload --fqbn esp8266:esp8266:nodemcuv2 \
  -p /dev/tty.usbserial-XXXX prototypes/dfplayer_tx_play
```

To make a short test clip replay, compile with a repeat interval, for example:

```bash
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 \
  --build-property compiler.cpp.extra_flags=-DTEST_REPEAT_INTERVAL_MS=10000 \
  prototypes/dfplayer_tx_play
```

## Power conditioning

At the DFPlayer VCC/GND pins, fit both:

- 100 nF ceramic capacitor, as physically close as practical;
- 470 uF to 1000 uF electrolytic capacitor, rated at least 10 V, with `+` to
  5V and `-` to GND.

The 1 kOhm TX-to-RX series resistor is recommended by DFRobot to reduce buzzing
and makes the connection more tolerant of module clones. It is still useful
with the ESP8266's 3.3V TX logic.

Use a regulated 5V supply. Budget **at least 1A for the DFPlayer/speaker test**;
if the NodeMCU shares that supply, route its supply and DFPlayer supply back to
the regulator separately (star-style) and keep the high-current speaker loop
away from the ESP and sensor wiring. A weak USB port is a common cause of
clicks, resets, and corrupt-looking playback.

## Adding the PAM 3W amplifier after the direct test passes

First, verify the exact amplifier board marking and its datasheet. "PAM8056"
is not a commonly documented 3W module name; many boards sold as 3W are
**PAM8403** boards, whose output is also bridge-tied. The following applies to
a normal line-input, BTL-output 3W PAM amplifier module.

| DFPlayer | PAM amp | Why |
|---|---|---|
| `DAC_L` **or** `DAC_R` | one channel `IN` | line-level audio into the amp |
| DFPlayer GND | amp signal/power GND | common signal reference |
| 5V | amp VCC | confirm against the actual board datasheet |
| amp `L+` and `L-` (or one channel's `+`/`-`) | the 8-ohm speaker | use the amplifier's output pair only |

For a single speaker, use **one** DAC channel to **one** amplifier channel.
Do not join `DAC_L` and `DAC_R` together unless the amplifier documentation
explicitly shows a safe mono-mix circuit; if you need to mix them, use two
resistors (for example 1 kOhm from each DAC output) into the amp input. Do not
connect `SPK1`/`SPK2` to any PAM input. Do not ground either amplifier speaker
terminal or combine BTL output terminals.

Put a further 100 nF ceramic plus 470 uF (or the amplifier board's specified
value) across the PAM's VCC/GND close to its power pins. With the external amp
fitted, use a **5V, 2A** regulated supply as the conservative starting point.
Keep its speaker wires twisted and short, especially in the sealed enclosure.

The DFPlayer's direct output is specified for speakers below 3W, so the
external amplifier is optional with an 8-ohm box speaker. Use it only after the
direct path is clean and only through the DAC line outputs; otherwise it adds
noise and power demand without helping the test.

## Integration note

GPIO1/TX is usable for this dedicated prototype, but it prevents normal USB
serial diagnostics in the production firmware. If production logging matters,
move the DFPlayer command output to a spare GPIO using `SoftwareSerial` (TX
only) or give the audio board a separate UART. Do not use GPIO0, GPIO2, or
GPIO15 casually: they are ESP8266 boot-strap pins.

References: [DFRobot DFPlayer manual](https://image.dfrobot.com/image/data/DFR0299/DFPlayer%20Mini%20Manul.pdf) and [DFRobot's current DFPlayer wiring note](https://wiki.dfrobot.com/dfr0299/docs/20905).

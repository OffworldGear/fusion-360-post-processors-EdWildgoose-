# Fusion 360 Post Processor: Brother Speedio C00 + Blum Laser NT / Z-Nano (OWG)

> [!WARNING]
> **TESTING VERSION - v3.7 / macros Rev C (2026-09-29)**
> Branch `SpeedioC00Updates-OWG`. Nothing in this release has run on the machine yet.
> Follow the [prove-out procedure](#prove-out-procedure-first-run) before cutting parts.

Machine: Brother Speedio **S500X2, C00 controller**, metric, 3-axis.
Tool setters: **Blum Z-Nano** touch setter (primary length) and **Blum Laser NT** (V5DE cycles
O86xx: wear/runout, break detection, length cross-check).

Based on Ed Wildgoose's Brother Speedio post for Autodesk Fusion.

---

## Contents

| File | Install where | Purpose |
|---|---|---|
| `OWGMods-edwildgoose6-24-26-patched-v3_7.cps` | Fusion post library | **Current testing post** |
| `OWGMods-edwildgoose6-24-26-patched-v3_6.cps`, `v3_5.cps` | - | Previous versions, kept for reference. **Do not use** (see [Why v3.7](#why-v37)) |
| `macros/O6008.NC` | C00 program memory | Laser NT length wrapper, Rev C. B3 = measure, B2 = compare only |
| `macros/O6009.NC` | C00 program memory | Laser NT wear/runout wrapper, Rev C |
| `macros/O9900.NC` | C00 program memory | Emergency cleanup: zero cutter comp geometry T1-T99, clear flag #580 |
| `brother speedio.cps` | - | Upstream post, for diffing |

All `.NC` files use CRLF line endings, lines of 80 characters or less, and no nested parentheses in comments.

Blum's own macros (O86xx, O89xx) are copyrighted by Blum-Novotest and are **not** in this public repo.

---

## Installation

1. **Back up the controller first** (Data Bank > save all programs and TOLSM1).
2. Load `O6008.NC`, `O6009.NC`, `O9900.NC` into program memory (overwrite the Rev B files).
3. Edit the Blum start-of-cycle program **O8670** on the controller. Change line 15 from
   `G90G0G53A-30.` to `(G90G0G53A-30.)(OWG A-AXIS MOVE REMOVED)`. Nothing else changes.
   This file runs at the start of **every** Blum laser cycle, including break detection. The rotary
   move was left over from a previous machine owner. (A patched copy is kept outside this repo in
   `Industrial Controls/Blum_Patched_OWG/O8670.NC`.)
4. Check that persistent variables **#580, #581, #582** are unused on your machine
   (Data Bank > Macro variables). They were verified unused by every Blum laser, Z-Nano,
   touch-probe and KinematicsPerfect macro in the Sept-25-2026 backup.
5. Confirm the user parameters: **<Machine unit system> = mm** and **<Program unit> = Base**
   (switch 1). The post adds decimal points to all laser macro arguments, but other code
   assumes Base.
6. Install `v3_7.cps` in Fusion and select it for the setup. Check the property defaults below.

---

## Workflow

### Tool length - Z-Nano is primary
- `toolLengthSetter` = **Z-Nano (P8915)** by default. Tools over 24 mm diameter always use the Z-Nano.
- `[LASER LEN]` in the Fusion tool comment forces the Laser NT for that tool (B3, writes length).

### Proving the laser - compare-only mode
With `laserLengthCheck = Compare only (B2)` (default), every Z-Nano length measurement is followed by
`G65 P6008 B2.`. This runs Blum's **control mode**. It measures with the laser and compares against the
table length. **It writes nothing** (O8603 skips all writes when |B| = 2).
- If the difference exceeds `laserLengthCompareTolerance` (default 0.02 mm), Blum raises alarm 16
  (OUT OF TOLERANCE).
- On success: **#581 = tool number, #582 = laser length minus table length (mm)**.
- Keep a log of #582 across your tool types. When it's consistently small, set `toolLengthSetter` to
  Laser NT.
- Also measure the calibration pin (T98) on both setters after warm-up. Any difference is a fixed
  offset that affects every tool.

### Wear / runout - O6009 with Fusion "Wear" compensation
- Tag a tool `[LASER WEAR]` or list it in `laserWearTools` to check it at program start.
- Add the Manual NC **Action** `laser_wear` to check it in-cycle.
- O6009 puts the Fusion nominal diameter into cutter comp geometry `#13000+T` (Blum needs it for
  positioning and collision limits). It runs O8603 in check mode (B1, radius only), then sets the
  geometry back to **0**.
- Blum writes the measured **diameter** wear to `#12000+T` (negative = tool smaller). With Fusion
  **Wear** compensation (`G41/G42 D`, geometry 0) that value moves the cutter directly.
- The tool **length must already be in the table**. O6009 alarms 9107 otherwise.

Supported for laser wear: flat, bullnose, ball, lollipop, face, slot, dovetail, drill, reamer.
Chamfer, thread, form, corner-rounding, tapered, taps, spot and centre drills, counterbores and
boring bars are refused, because a single radius measurement is meaningless on them.

### In-cycle checks (Manual NC)
Add a Manual NC **Action** before the operation:
- `laser_wear` or `measure_wear`: O6009 on the tool of that operation.
- `laser_length` or `measure_length`: length measurement with the selected setter.

The post retracts, runs the check, restores modal state, and the next operation does a full approach
move (XY, then `G43 Z H`).

---

## Safety interlocks added in v3.7

| Where | Interlock | Alarm |
|---|---|---|
| Program start (never block-skipped) | `#4006` must match the posted unit. The C00 has **no G20/G21**; units come from `<Machine unit system>` | 9120 MACHINE NOT IN MM |
| Program start | `#580 > 0` means an O6008/O6009 run was interrupted with a nominal diameter still in `#13000+T`. It is zeroed, the flag cleared, then the alarm is raised. Just restart; check that tool's wear | 9122 LASER MEAS ABORTED |
| Program start | `#13000+T` and `#13000+D` zeroed for every tool in the program | - |
| Every operation with **Wear** comp | `#13000+D` zeroed. Alarm if `ABS[#12000+D] > maxDiameterWear` (default 0.1 mm). Blum writes wear even when it then alarms, so a bad reading can never reach a finishing pass | 9121 Tn WEAR OVER LIMIT |
| Post time | "In control" and "Inverse wear" comp refused. Wear comp with D ≠ T refused | post error |
| Post time | Blum laser features refused for inch programs (Blum error E18) | post error |
| Post time | In-cycle tool check refused while a G68 probe rotation is active (Blum overwrites #100/#101/#143 that the rotation was built from) | post error |
| After every Blum/Z-Nano call | `G28 G91 Z0.` then explicit `G90 G17 G40 G80 G94`, `G49` at Z reference. Rotation, WCS, axis, spindle and coolant caches invalidated | - |
| O6008 / O6009 | Tool number 1-99, D 0.1-24 mm, mode B 2 or 3 | 9101 / 9102 / 9106 / 9108 |
| O6009, and O6008 B2 | Table length must be 50-200 mm (O8671 `#111`/`#110`) | 9107 NO VALID TOOL LEN |
| O6008 / O6009 | Blum status `#100` must be 0. Geometry is zeroed before the alarm | 9103 BLUM MEAS FAILED |
| O6009 | `ABS[#12000+T] > U` | 9104 WEAR OVER LIMIT |
| O6008 / O6009 | `G90` restored after the Blum call and on exit. `G91 G28 Z0. / G90 G49` before any internal tool change | - |

Blum's own alarms are 9001-9024 (`#3000=1..24`). The OWG alarms use 9101-9122 so they never collide.
C00 alarm messages are limited to 20 characters (manual 6.2.6.4).

### Recovery after an alarm during O6008/O6009
Blum raises its own alarm inside O8603, so the wrapper cleanup cannot run. Either run **O9900**, or
just restart the program; the start guard cleans up (alarm 9122 once, then it runs).

---

## Why v3.7

Crash-class problems found in v3.6 / Rev B (details in the commit message):

1. **Blum exits in G91 + G49.** O8639 (end of every V5DE laser cycle) leaves `G91` and `G49` active.
   v3.6 cleared only its G43 memory:
   - An in-cycle Manual NC check followed by the same tool ran its approach moves **incremental**.
   - A tool measure at a tool change started cutting **without tool length offset**, one full tool
     length (70-175 mm) low.
2. **O6009 Rev B removed the tool length check.** Blum's own check does not apply when the length is 0
   (O8633 line 159). O8603 then positions Z from `#111` = 50 mm, so a new tool was driven about
   (length - 50) mm below the beam, past the 30 mm clearance (`#109`).
3. **Off-centre laser length on pointed tools.** Measuring a chamfer, thread or form tool at
   X = 0.8R stores a length that is too **short**, so the tool plunges deeper than programmed
   (about 3.8 mm on a 3/8" 90° chamfer mill). Now only flat-bottomed types are measured off-centre;
   everything else goes on-centre via O8602.
4. **O8670 rotated A to -30°** at the start of every laser cycle, and the post never restored it.
5. Also fixed:
   - "tapered mill" was treated as a drill (substring "tap").
   - `TOOL_MILLING_BALL` does not exist in the Fusion API.
   - Alarm numbers collided with Blum's.
   - `toolBreakageTolerance` 0.0025 mm caused false break alarms (now 0.04 mm).
   - Renishaw `D12.7.` double decimal point.
   - With B.SKP ON the start-of-program G90/G94 could be suppressed.

## C00 facts used (NC Programming Manual eCOM3NCPR 2020/02/26)
- No G20/G21. Units come from `<Machine unit system>`; read with `#4006` (20 inch / 21 metric).
- Only `IF [cond] GOTO n` (no THEN). `WHILE [] DOm .. ENDm`, up to 4 deep.
- G65 nesting is limited to **4 levels** (8 including M98). O6009 → O8603 → O8630 → O8670 uses all 4,
  so **O6008/O6009 must be called from a main program only**.
- `#3000=n(MSG)` → alarm 9000+n, maximum 20 characters. `#3006=(MSG)` → stop with message.
- `#3700` = tool in spindle. Tool data: `#11001` length, `#10001` length wear, `#13001` cutter comp,
  `#12001` diameter wear (all diameters).
- `#500-#999` persist through power off. `#100-#199` are cleared at power off (Blum uses #100-#191).
- `M159` = no read-ahead. G65 cannot run from MDI.
- Spaces inside `IF [ ]` and `[ ]`, `:`, `=`, `/`, `-` inside comments are all used by programs that
  already run on this machine. The O8820 generator's "no whitespace" rule is not required.

---

## Post properties (probing group)

| Property | Default | Notes |
|---|---|---|
| `toolLengthSetter` | **Z-Nano** | `laserNT` = O6008 B3 for all laser-capable tools |
| `laserLengthCheck` | **Compare only (B2)** | Laser shadow check after each Z-Nano length |
| `laserLengthCompareTolerance` | 0.02 mm | O6008 Q in B2 |
| `maxDiameterWear` | 0.1 mm | Wear-comp guard limit and O6009 U |
| `laserRunoutTolerance` | 0.025 mm | O6009 Q (per cutting edge) |
| `toolBreakageTolerance` ("Tool breakage detect tolerance") | **0.04** | P8608 / P8915 break Q. Moved from the collapsed Preferences group to Probing in v3.7 |
| `measureTools` / `measureToolsList` | off / all | Start-of-program length measurement (block-skippable) |
| `laserWearTools` | empty | Start-of-program O6009 list |
| `scanLollipopContour` | off | O8607 contour scan for lollipops |

Tool comment tags: `[LASER LEN]`, `[ZNANO LEN]`/`[TOUCH LEN]`, `[LASER WEAR]`, `[LASER SCAN]`,
`[LASER BREAK]`, `[ZNANO BREAK]`/`[TOUCH BREAK]`.

---

## Prove-out procedure (first run)

Do these in order, in **memory mode** (G65 cannot run from MDI), single block, rapid override 25%,
hand on feed hold.

1. **O9900** - confirm all cutter comp geometry is 0 and #580 = 0.
2. **Start guards**: post any short job and run only up to the end of the `(OWG SAFETY GUARDS)` block.
   Confirm it passes the unit check; set #580 = 5 by hand and confirm alarm 9122 appears and #13005/#580 are cleared.
3. **O6008 compare, standalone**: a short program with a known flat end mill that the Z-Nano already
   measured:
   `G65 P6008 B2. T5. D12.7 C3. K0. Q0.02 Z0.5 X5.08` then `M30`.
   Watch the approach to the laser. Afterwards check #580 = 0, #13005 = 0, and #582 (difference).
4. **O6009 standalone**: same tool, `G65 P6009 T5. D12.7 C3. K0. U0.1 Z0.5 X5.08`, then `M30`.
   Check #12005 (wear), #13005 = 0, #580 = 0.
5. **O6009 guard**: pick an empty pocket number with length 0 in the table and call O6009 with it:
   it must alarm **9107** without moving.
6. **In-cycle**: post a small job with a Manual NC `laser_wear` before a finishing pass that uses the
   same tool. Single-block through the restore blocks (`G28 G91 Z0.`, `G90 G17 G40 G80 G94`, `G49`)
   and the approach move (`G0 X Y`, `G43 Z H`) - air-cut first.
7. **Wear guard**: set #12005 = 0.2 by hand and run a Wear-comp job with T5. It must alarm **9121**
   before cutting. Put the value back.

---

## PC-side tool wear manager (`IndustrialAutomation/speedio_tool_wear`)
`O8820`, generated by `speedio_laser_wear.py`, is a separate path that calls O8603 directly. v3.7
changes only its final sweep (all 99 tools, local counter, clears #580) and adds `G90` after each
Blum call. Known limitations - prefer the post / O6009 path:
- It uploads a full **TOLSM1** tool table. Any length re-measured on the machine between download and
  File Input is reverted.
- It has no tool-type check (e.g. T5 chamfer mill is measured at Z2.5, which reads as a broken tool).
- Its FTP credentials are stored in plain text in `tool_database.json`, and FTP is unencrypted.
  Keep the controller on an isolated network.

---

## Version history
- **v3.7 / Rev C (2026-09-29, testing)**: crash-safety review. See [Why v3.7](#why-v37) and the header
  of the `.cps` file.
- v3.6 / Rev B: drill taper radians fix, lollipop classification, IF-GOTO syntax, laserRunoutTolerance.
- v3.5: precision laser geometry engine, DPRNT hardening, G49/SM4054 hardening.
- v3.4: Laser NT / Z-Nano selection, comment tags, break control, measure lists.

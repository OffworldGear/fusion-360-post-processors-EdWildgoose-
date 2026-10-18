# Fusion 360 Post Processor: Brother Speedio C00 + Blum Laser NT / Z-Nano (OWG)

> [!WARNING]
> **TESTING VERSION - v3.8 / macros Rev D (2026-10-18)**
> Branch `SpeedioC00Updates-v3_8`.
> Follow the [prove-out procedure](#prove-out-procedure-first-run) before cutting parts.

**Which build am I running?** Every NC file starts with the program name, then
`(OWG POST V3.8.0 2026-10-18)`. The same build shows in Fusion's post description and in the
`OWG BUILD:` line at the top of the `.cps`. If a posted program has no `OWG POST` line, it was
made by an older post - re-post it. (The Autodesk header at the top of the file is the same in
every version and does not identify the build.)

Machine: Brother Speedio **S500X2, C00 controller**, metric, 3-axis.
Tool setters: **Blum Z-Nano** touch setter (primary length) and **Blum Laser NT** (V5DE cycles
O86xx: wear/runout, break detection, length cross-check).

Based on Ed Wildgoose's Brother Speedio post for Autodesk Fusion.

---

## Quick start - which setter measures what?

All measuring settings are in the NC Program dialog, **Post Process > Probing**, numbered 1-6.
Two checkboxes are also on each operation's **Post Process** tab.

**Every program prints a MEASUREMENT PLAN** at the top of the NC file (and in the post log)
listing every tool, which setter it uses, and whether it will be measured. Read it before running.

```
(MEASUREMENT PLAN - LENGTH METHOD ZNANOCOMPARE)
(START LENGTH CHECKED / START WEAR CHECKED)
(T01 D6 LEN ZNANO+LASER CMP WEAR NO)
(T03 D6 LEN ZNANO Z-NANO LIST WEAR NO)
(T07 D12.7 LEN ZNANO+LASER CMP WEAR YES)
(T12 D50 LEN ZNANO NO COMPARE OVER 24MM WEAR NO)
(T14 D8 LEN NO [ZNANO+LASER CMP] WEAR NO)      <- not ticked: shows what it WOULD use
(T20 D10 LEN NEVER WEAR NO)                     <- on the Never-measure list
(T21 D16 LEN LASER LASER LIST WEAR NO)
```

### How each tool's length setter is chosen (first match wins)
1. **6. Never measure tools** list or `[NO MEASURE]` tag: never measured (length or wear).
2. **4. Z-Nano only tools** list or `[ZNANO LEN]` tag: Z-Nano, no laser compare.
3. **5. Laser tools** list or `[LASER LEN]` tag: Laser NT writes the length (O6008 B3).
4. Otherwise **1. Length method**:
   - *Z-Nano only*
   - *Z-Nano + laser compare* (default): Z-Nano writes the length, then the laser re-measures it in
     compare-only mode (O6008 B2) and writes nothing. The laser never measures a length on its own
     in this mode; B2 needs the Z-Nano value already in the table.
   - *Laser only*

Any tool the laser can't take (over 24 mm, or an inch program) automatically uses the Z-Nano.
Lists are tool numbers (e.g. `3, 12, 20-25`), not pocket numbers. Tags go in the Fusion tool comment
and stay with the tool in your library.

### Which tools get measured at program start
- **2. Measure length at program start**: *Off* / *Checked operations* (default) / *All tools*
- **3. Laser wear check at program start**: *Off* / *Checked operations* (default) / *All tools*
- *Checked operations* = tools used by any operation with **Measure tool length at start** or
  **Laser wear check at start** ticked on its Post Process tab (or tagged `[LASER WEAR]`).
- The whole start-of-program block is block-skippable: B.SKP ON skips it.

### Recipes
| I want to... | Set |
|---|---|
| Measure length with the Z-Nano and prove the laser | 1 = *Z-Nano + laser compare*, 2 = *Checked operations*, tick the ops |
| Z-Nano only, no laser at all | 1 = *Z-Nano only* |
| Laser for most tools, Z-Nano for a few | 1 = *Laser only*, list the few in 4 |
| Z-Nano for most tools, laser for a few | 1 = *Z-Nano only* (or compare), list the few in 5 |
| Skip a tool that fits neither setter | put it in 6 or tag `[NO MEASURE]` |
| Check wear on finishing tools each run | 3 = *Checked operations*, tick **Laser wear check at start** on the finishing ops |
| Update wear mid-program before an operation | Tick **Update tool wear before operation** on op tab, tag `[WEAR]`, or Manual NC `MEASURE_TOOL:WEAR` |
| Auto-update wear on Wear-comp finishing passes | Post property `Auto-update laser wear before Wear-comp finishing passes` (`a3bAutoWearBeforeFinish`) |
| Check wear/integrity without changing wear table | Tag `[CHECK]`, Manual NC `MEASURE_TOOL:CHECK`, or enable Fusion **Break control** on milling tools (O6009 B-2.0) |
| Scan / measure spherical lollipop cutter | Post properties `b5LollipopStartAngle` (25°), `b5LollipopEndAngle` (135°), tick `11. Scan lollipop contour` or tag `[LASER SCAN]` |

> **Mixing setters:** the Z-Nano and laser currently differ by roughly 10-20 µm. Until they are
> calibrated to the same master, tools that finish the same floor or face should use the **same**
> setter, or that difference appears as a step. Compare mode logs the difference per tool in
> **#582** (tool in #581), so you can see when they agree.

---

## Contents

| File | Install where | Purpose |
|---|---|---|
| `OWGMods-edwildgoose6-24-26-patched-v3_8.cps` | Fusion post library | **Current production post processor (v3.8.0)** |
| `OWGMods-edwildgoose6-24-26-patched-v3_7.cps` | - | Previous baseline version, preserved intact for reference |
| `OWGMods-edwildgoose6-24-26-patched-v3_6.cps`, `v3_5.cps` | - | Older versions, kept for reference. **Do not use** |
| `macros_v3_8/O6008.NC` | C00 program memory | Laser NT length wrapper, Rev D. B-3.0 fast measure, B-2.0 fast compare. Native Blum #115 radius pass-through (Zero-Comp Guarantee) |
| `macros_v3_8/O6009.NC` | C00 program memory | Laser NT wear/runout wrapper, Rev D. B-1.0 wear update, B-2.0 check-only, lollipop arc wear (O8606 / O8607). Native Blum #115 radius pass-through |
| `macros/O6010.NC` | C00 program memory | Rev 4: manual wear + runout check of the **spindle tool**. Front end for O6009 |
| `macros/O6007.NC` | C00 program memory | Emergency cleanup (was O9900): zero cutter comp geometry T1-T99, clear flag #580 |
| `tests/` | Dev / CI environment | Automated test engine: `cps_compiler.js` (V8 vm.Script syntax), `fusion_harness.js` (CAM execution engine), `macro_validator.js` (C00 Fanuc macro validator), 4 testing tiers |
| `brother speedio.cps` | - | Upstream post, for diffing |

All `.NC` files use CRLF line endings, lines of 80 characters or less, and no nested parentheses in comments.

Blum's own macros (O86xx, O89xx) are copyrighted by Blum-Novotest and are **not** in this public repo.

---

## Installation

1. **Back up the controller first** (Data Bank > save all programs and TOLSM1).
2. Load `O6007.NC`, `macros_v3_8/O6008.NC`, `macros_v3_8/O6009.NC`, `O6010.NC` into program memory (overwrite previous versions).
   Delete any old `O9900` from the PC side - the C00 cannot use programs 9000-9999.
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
6. Install `OWGMods-edwildgoose6-24-26-patched-v3_8.cps` in Fusion and select it for the setup. Check the property defaults below.

---

## Workflow details

### The Zero-Comp Guarantee (3-Layer Architecture)
In earlier versions, wrapper macros wrote nominal tool diameter into the cutter compensation geometry register `#[13000+T]` during probing cycles so Blum cycles had positioning limits, and zeroed it upon exit. If an emergency stop, reset, or unhandled alarm occurred mid-cycle, a non-zero value remained in `#[13000+T]`. Combined with Fusion's **Wear** compensation (`G41/G42 D`), this would shift the cutter path by an entire nominal radius (e.g. 5 mm on a 10 mm end mill), causing a severe crash into the workpiece.

v3.8 establishes a strict **Zero-Comp Guarantee** across 3 independent defense layers:
1. **Layer 1 (Macro Radius Pass-Through):** Native Blum `#115` radius injection is restored across `O8671`, `O6008`, and `O6009`. Nominal tool radius is passed directly to Blum cycles via `#115 = [tool.diameter / 2.0]`. The cutter comp geometry register `#[13000+T]` is **never written with nominal tool dimensions**.
2. **Layer 2 (Native Pre-Alarm Cleanup):** Blum start/end program `O8679` (`USERENDPROG`) zeroes `#[13000+T] = 0.` and clears `#580 = 0.` before any `#3000` alarm halts execution, guaranteeing clean state on controller resets or tool-breakage aborts.
3. **Layer 3 (Post Processor Invariant):** The post processor emits explicit `#[13000+T] = 0.0000` at program start, at every tool change, after touch probe cycles (`O8706`), and after every Blum/Z-Nano measuring cycle in `restoreModalStateAfterToolCheck`.

### Fast approach length measurement & compare (`O6008`)
- **Mode B-3.0 (Fast Approach Measure & Write):** The default length measurement mode (`writeLaserLengthBlock(tool, -3.0)`). If a valid length exists in the tool table (`#11000+T > 0`), the machine rapids directly to a 2 mm clearance plane above the laser beam, saving substantial cycle time. If the table length is 0 (a fresh tool), it automatically falls back to slow search from the upper limit. Length is updated in `#11000+T`.
- **Mode B-2.0 (Fast Compare-Only):** With **1. Length method = Z-Nano + laser compare**, Z-Nano writes the length, followed by `G65 P6008 B-2.0`. Rapid approach (2 mm clearance) checks the laser reading against table length without writing to the table. If difference > tolerance (property 7, default 0.02 mm), Blum alarms 16. The measured difference is logged in **#582** (tool in **#581**).
- **Tool offsets preserved:** Neither mode wipes length offset `#[11000+T]`, length wear `#[10000+T]`, or diameter wear `#[12000+T]` prior to measuring.

### Laser wear update (`B-1.0`) vs. Check-only (`B-2.0`) (`O6009`)
`O6009` supports two distinct operating modes:
- **Mode B-1.0 (Wear Update):** Measures the spinning tool envelope and writes the measured diameter change to `#[12000+T]`. For Fusion **Wear** compensation (`G41/G42`), this offset adjusts the cutting path directly.
- **Mode B-2.0 (Check-Only / Control Mode):** Evaluates flute condition, runout (property 9), and total diameter envelope against the wear limit (property 8) at 3000 RPM. **It writes nothing to `#[12000+T]`**, ensuring that tool integrity and breakage can be verified without altering calibrated wear values.

Supported tool types for laser wear: flat, bullnose, ball, lollipop, face, slot, dovetail, drill, reamer. Chamfer, thread, form, and tapered tools are excluded (`WEAR NO TYPE N/A`).

### In-cycle wear triggering & modal safety
Wear measurement can be triggered dynamically before any machining operation:
1. **Per-Operation UI Checkbox:** **Update tool wear before operation (Laser O6009)** (`opUpdateWearBefore`, scope: operation) on the operation's Post Process tab runs `O6009 B-1.0` immediately before cutting.
2. **Auto-Wear on Finishing Passes:** Post property `Auto-update laser wear before Wear-comp finishing passes` (`a3bAutoWearBeforeFinish`, scope: post) automatically triggers `O6009 B-1.0` before any milling pass using Wear compensation (`G41/G42`) where radial stock to leave is 0.
3. **Comment Tags:** Adding `[WEAR]` or `[UPDATE WEAR]` in the operation comment triggers `O6009 B-1.0`. Adding `[CHECK]` triggers `O6009 B-2.0` (check-only).
4. **Manual NC Actions:** Add a Manual NC **Action** before the operation:
   - `MEASURE_TOOL:WEAR` or `laser_wear`: `O6009 B-1.0` wear update.
   - `MEASURE_TOOL:CHECK`: `O6009 B-2.0` check-only mode.
   - `MEASURE_TOOL:LASER` or `laser_length`: `O6008 B-3.0` fast length measurement.
   - `MEASURE_TOOL:ZNANO`: `P8915 B0.` Z-Nano length measurement.
   - `MEASURE_TOOL:BOTH`: Length measurement followed by `O6009 B-1.0` wear update.
5. **Modal Safety & Prepositioning:** Every in-cycle check retracts Z (`G28 G91 Z0.`), cancels length comp (`G49`), flushes modal caches (`G90 G17 G40 G80 G94`), executes the macro, restores coolant, starts the spindle (`M3 S... / M159`), and prepositions in XY before applying `G43 Z H`.
6. **Section Deduplication:** If multiple triggers (e.g. checkbox + tag) apply to the same operation, redundant checks are deduplicated.

### End-of-operation break detection (`COMMAND_BREAK_CONTROL`)
Fusion 360 operation break control is cleanly separated by tool type and setter:
- **Laser NT Milling Tools (<= 24 mm):** Supported milling tools invoke `O6009 B-2.0` (Check-Only mode). The tool spins at 3000 RPM across the beam, checking for breakage and chipped flutes without touching `#[12000+T]`.
- **Laser NT Centric Drills & Taps:** Centric tools start the spindle at 3000 RPM (`M3 S3000`), flush lookahead (`M159`), dwell 1.5 s (`G4 X1.5`), call Blum cycle `G65 P8608 H[T] X[geom.x] M1. Q[tol] W0.`, and stop the spindle (`M5`). Pointed drill geometry uses an off-center measuring position `geom.x` to prevent false break alarms.
- **Touch Setter Tools (> 24 mm or Z-Nano):** Large tools and Z-Nano tools call touch setter break cycle `G65 P8915 B2. H[T] Q[tol]`.

### Lollipop cutter support (`TOOL_MILLING_LOLLIPOP`)
- **Arc Wear Measurement (`O8606 B-1.0`):** Computes least-squares spherical arc fit across user-defined angles `b5LollipopStartAngle` (default 25.0°) and `b5LollipopEndAngle` (default 135.0°, extending into the upper undercut hemisphere). Injects `#115 = [diameter / 2.0]` with zero-comp guards.
- **Arc Check-Only (`O8606 B-2.0`):** Checks spherical profile against wear tolerance without altering wear registers.
- **Contour Scanning (`O8607`):** With property `11. Scan lollipop contour with laser` enabled or tagged `[LASER SCAN]`, runs Blum continuous contour scanning.

### Touch probe wear update fix (`O8706`)
In surface probing cycles with **Update tool wear** enabled:
- **K Factor Scaling Fix:** Fusion outputs wear correction percentage (0-100%). Blum `O8706` expects a scaling factor $K \le 2.0$. The post divides `cycle.toolWearErrorCorrection` by 100.0 (e.g. 50% $\rightarrow$ K0.5000), preventing Blum Alarm 105.05 (*CALL PARAMETERS OUT OF RANGE*).
- **Zero-Comp Guard:** Emits `ensureWearModeZeroComp(tool.diameterOffset)` immediately after `G65 P8706` to prevent diameter comp corruption.

### Manual check of the spindle tool (`O6010`)
Edit the three values at the top of O6010 - **D** nominal diameter (mm), **C** number of flutes,
**K** type (0 flat, -1 ball, corner radius = bullnose, -3 drill, -5 lollipop) - and Cycle Start in Memory mode.
**C must be exact at the measuring height**: Blum's edge check slows the spindle to about
3750 / C RPM and expects exactly C pulses per revolution, so a wrong count gives alarm 15
*CUTTING EDGE BROKEN*. On a **4-flute ball mill only 2 flutes reach the tip** - measured near the
tip it always fails. K = -1 measures a ball at its equator, where all flutes are full diameter.
Run O6010 standalone; from another program call O6009 directly.

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
| Before every Blum/Z-Nano call (and before start-of-program measuring) | `G28 G91 Z0.`, `G90`, then `G49` at Z reference. Blum Z-Nano O8915 cancels an active G43 with an incremental Z move up by offset + tool length, which from Z reference trips **SM2033 Limit exceeded (+Z)** | - |
| After every Blum/Z-Nano call | `G28 G91 Z0.` then explicit `G90 G17 G40 G80 G94`, `G49` at Z reference. Rotation, WCS, axis, spindle and coolant caches invalidated | - |
| O6008 / O6009 | Tool number 1-99, D 0.1-24 mm, mode B 2 or 3 | 9101 / 9102 / 9106 / 9108 |
| O6009, and O6008 B2 | Table length must be 50-200 mm (O8671 `#111`/`#110`) | 9107 NO VALID TOOL LEN |
| O6008 / O6009 | Blum status `#100` must be 0. Geometry is zeroed before the alarm | 9103 BLUM MEAS FAILED |
| O6009 | `ABS[#12000+T] > U` | 9104 WEAR OVER LIMIT |
| O6008 / O6009 | `G90` restored after the Blum call and on exit. `G91 G28 Z0. / G90 G49` before any internal tool change | - |

Blum's own alarms are 9001-9024 (`#3000=1..24`). The OWG alarms use 9101-9122 so they never collide.
C00 alarm messages are limited to 20 characters (manual 6.2.6.4).

### Recovery after an alarm during O6008/O6009
Blum raises its own alarm inside O8603, so the wrapper cleanup cannot run. Either run **O6007**, or
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
- Program numbers **9000-9999 cannot be used** (data manual, program edit Note 1; 9900-9999 are
  schedule programs). User programs must be 1-8999.
- Program files: the program number comes from the **file name** (`O6007.NC`). No `O6007` line and
  no `%` inside the file - address O is reserved for comments (manual 1.3). Start with a comment line,
  like every program in the controller backup. Max 128 characters per block.
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

## Blum touch-probe notes
- **Partial circle (hole/boss) angles**: Blum O8711 alarms 101.21 *INVALID CALL PARAMETERS* if any
  angle is outside **0-359.0 deg** or two angles are less than 10 deg apart by plain subtraction (no
  wrap-around). The post moves an angle above 359.0 to 0 or 359 (at most 0.5 deg, with a warning) and
  refuses angle sets Blum would reject. Before this fix, Fusion's -0.21 deg was posted as 359.79 deg.

## Post properties (Post Process > Probing)

| Property | Default | Notes |
|---|---|---|
| 1. Length method | **Z-Nano + laser compare** | Z-Nano only / Z-Nano + laser compare / Laser only |
| 2. Measure length at program start | **Checked operations** | Off / Checked operations / All tools |
| 3. Laser wear check at program start | **Checked operations** | Off / Checked operations / All tools |
| Auto-update laser wear before Wear-comp finishing passes | **off** | `a3bAutoWearBeforeFinish`: auto-runs O6009 B-1.0 before any Wear-comp pass (G41/G42) with radial stock = 0 |
| 4. Z-Nano only tools | empty | Tool numbers; same as `[ZNANO LEN]` |
| 5. Laser tools | empty | Tool numbers; same as `[LASER LEN]` |
| 6. Never measure tools | empty | Tool numbers; same as `[NO MEASURE]` |
| 7. Laser compare tolerance (mm) | 0.02 | O6008 B-2.0 Q compare tolerance |
| 8. Max diameter change - wear + runout (mm) | 0.1 | Spinning envelope vs Fusion nominal. Written to #12000+T and used by Wear comp. O6009 U, guard 9121 |
| 9. Uneven edge tolerance - runout or chip (mm) | 0.025 | Each edge vs the largest edge, ignores nominal. Fails on chipped flute or runout (Blum alarm 15). Pass/fail, O6009 Q |
| 10. Tool breakage detect tolerance | **0.04** | P8608 / P8915 break Q |
| 11. Scan lollipop contour with laser | off | O8607 contour scan for lollipops |
| Lollipop measuring start angle (deg) | **25.0** | `b5LollipopStartAngle`: starting angle on spherical arc for O8606 / O8607 (I parameter) |
| Lollipop measuring end angle (deg) | **135.0** | `b5LollipopEndAngle`: ending angle on spherical arc for O8606 / O8607 (K parameter, undercut hemisphere) |
| 12. Laser measuring RPM | **3000** | Speed for every laser measurement - the calibration speed (O6011 S3000), never the tool's cutting RPM |
| Confirm tool lengths | off | Stops with a message if table length is shorter than modeled length by more than tolerance |
| Confirm tool lengths tolerance (mm) | 1.0 | Allowed shortfall for collision safety |

### Per-operation settings (Operation dialog > Post Process tab)
- **Measure tool length at start** (`opMeasureTool`): Include tool in start-of-program length measurement.
- **Laser wear check at start** (`opLaserWear`): Include tool in start-of-program laser wear check.
- **Update tool wear before operation (Laser O6009)** (`opUpdateWearBefore`): Runs `O6009 B-1.0` wear update immediately before this operation.

### Tool comment tags
- Length setter: `[LASER LEN]`, `[ZNANO LEN]` / `[TOUCH LEN]`, `[NO MEASURE]`
- Wear triggering: `[LASER WEAR]`, `[WEAR]`, `[UPDATE WEAR]` (B-1.0 wear update), `[CHECK]` (B-2.0 check-only)
- Contour scanning: `[LASER SCAN]`
- Break detection setter: `[LASER BREAK]`, `[ZNANO BREAK]` / `[TOUCH BREAK]`

### Manual NC Actions
Insert a Manual NC **Action** before an operation:
- `MEASURE_TOOL:WEAR` or `laser_wear`: `O6009 B-1.0` wear update
- `MEASURE_TOOL:CHECK`: `O6009 B-2.0` check-only mode
- `MEASURE_TOOL:LASER` or `laser_length`: `O6008 B-3.0` fast length measurement
- `MEASURE_TOOL:ZNANO`: `P8915 B0.` Z-Nano length measurement
- `MEASURE_TOOL:BOTH`: Length measurement followed by `O6009 B-1.0` wear update

---

## Automated Test & Validation Engine

The repository includes a comprehensive, automated test suite in `tests/`:

1. **Syntax & V8 Script Compiler (`tests/lib/cps_compiler.js`):**
   Validates the post processor source code against the Node.js V8 execution engine (`vm.Script`) to detect syntax errors, unclosed scopes, or illegal tokens before loading into Fusion.
2. **CAM Sandbox Harness (`tests/lib/fusion_harness.js`):**
   Full emulation of the Autodesk Fusion CAM post processing environment in Node.js. Simulates CAM tools, section state machines, kinematics, formatters, and lifecycle hooks (`onOpen`, `onSection`, `onCommand`, `onSectionEnd`, `onClose`).
3. **Macro Syntax Validator (`tests/lib/macro_validator.js`):**
   Validates CNC macro files (`.NC`) against Brother Speedio C00 Fanuc/Brother macro constraints:
   - Line length limits (<= 80 characters recommended, <= 128 max)
   - Comment safety: no nested parentheses `( ... ( ... ) ... )`
   - CRLF line endings
   - Valid IF-GOTO branching syntax (no unsupported THEN keywords)
   - Alarm number ranges (9101-9122) and alarm message lengths (<= 20 chars)
4. **Multi-Tier Test Tiers:**
   - `tier1_feature`: Core feature checks (Zero-comp invariant, fast approach modes, wear vs check-only, lollipop arc wear, break control).
   - `tier2_boundary`: Extreme values, zero-tolerances, maximum tool diameters, aperture limits.
   - `tier3_pairwise`: Setter combinations, tool types, and operation flag interactions.
   - `tier4_realworld`: Complex multi-tool part programs and production setups.

---

## Prove-out procedure (first run)

Do these in order, in **memory mode** (G65 cannot run from MDI), single block, rapid override 25%,
hand on feed hold.

1. **O6007** - confirm all cutter comp geometry is 0 and #580 = 0.
2. **Start guards**: post any short job and run only up to the end of the `(OWG SAFETY GUARDS)` block.
   Confirm it passes the unit check; set #580 = 5 by hand and confirm alarm 9122 appears and #13005/#580 are cleared.
3. **O6008 compare, standalone**: a short program with a known flat end mill that the Z-Nano already
   measured:
   `G65 P6008 B-2. T5. D12.7 C3. K0. Q0.02 Z0.5 X5.08` then `M30`.
   Watch the fast 2mm approach to the laser. Afterwards check #580 = 0, #13005 = 0, and #582 (difference).
4. **O6009 standalone wear update**: same tool, `G65 P6009 B-1. T5. D12.7 C3. K0. U0.1 Z0.5 X5.08`, then `M30`.
   Check #12005 (wear updated), #13005 = 0, #580 = 0.
5. **O6009 standalone check-only**: same tool, `G65 P6009 B-2. T5. D12.7 C3. K0. U0.1 Z0.5 X5.08`, then `M30`.
   Check #12005 (wear unchanged), #13005 = 0, #580 = 0.
6. **O6009 guard**: pick an empty pocket number with length 0 in the table and call O6009 with it:
   it must alarm **9107** without moving.
7. **In-cycle wear update**: post a small job with checkbox **Update tool wear before operation** or Manual NC `MEASURE_TOOL:WEAR` before a finishing pass. Single-block through the restore blocks (`G28 G91 Z0.`, `G90 G17 G40 G80 G94`, `G49`) and the approach move (`G0 X Y`, `G43 Z H`) - air-cut first.
8. **Wear guard**: set #12005 = 0.2 by hand and run a Wear-comp job with T5. It must alarm **9121**
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
- **v3.8.0 (2026-10-18)**: Stage 8 architectural upgrade (`OWGMods-edwildgoose6-24-26-patched-v3_8.cps`, `macros_v3_8/` Rev D):
  - **Zero-Comp Guarantee**: Native Blum `#115` radius pass-through restored in O8671, O6008, O6009; nominal dimensions never written into `#[13000+T]`; `O8679` pre-alarm cleanup; explicit post zero-comp guards at start, tool changes, and after all tool cycles.
  - **Fast Approach Modes**: `O6008 B-3.0` fast 2mm approach (auto slow search fallback); `O6008 B-2.0` fast compare mode; tool table offsets preserved.
  - **Laser Wear vs Check-Only**: `O6009 B-1.0` updates wear register `#[12000+T]`; `O6009 B-2.0` check-only mode tests breakage/runout without modifying table.
  - **In-Cycle Wear Triggering**: UI checkbox `opUpdateWearBefore`, post property `a3bAutoWearBeforeFinish`, tags `[WEAR]`/`[CHECK]`, Manual NC `MEASURE_TOOL` actions, modal restore safety, and deduplication.
  - **End-of-Operation Break Control**: Redesigned `COMMAND_BREAK_CONTROL` (O6009 B-2.0 check-only for milling; running spindle P8608 with geom.x offset for drills/taps; P8915 B2. for touch tools).
  - **Lollipop Cutters**: `O8606` least-squares arc fit across `I`..`K` angles (`b5LollipopStartAngle`/`EndAngle`); `O8607` contour scan; `#115` radius injection.
  - **Touch Probe Wear Update**: Divided `cycle.toolWearErrorCorrection` by 100.0 to prevent Alarm 105.05 ($K \le 2.0$ limit); emitted `ensureWearModeZeroComp`.
  - **Automated Test Suite**: Added test harness, V8 script compiler validation, and C00 macro validator.
- **v3.7.11 (2026-10-12)**: build number added (description, NC header line, `.cps` header).
  Builds 3.7.1-3.7.10 (2026-09-29 to 2026-10-12) are the v3.7 commits on this branch, the last
  being the G49-before-Blum fix for SM2033 (+Z) in the Z-Nano break check.
- **v3.7 / Rev C (2026-09-29, testing)**: crash-safety review. See [Why v3.7](#why-v37) and the header
  of the `.cps` file.
- v3.6 / Rev B: drill taper radians fix, lollipop classification, IF-GOTO syntax, laserRunoutTolerance.
- v3.5: precision laser geometry engine, DPRNT hardening, G49/SM4054 hardening.
- v3.4: Laser NT / Z-Nano selection, comment tags, break control, measure lists.

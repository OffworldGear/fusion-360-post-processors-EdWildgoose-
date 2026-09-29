# Fusion 360 Post Processors: Brother Speedio C00 (OWG Modifications)

> [!WARNING]
> **WORK IN PROGRESS (NOT A FINAL RELEASE)**  
> This branch (`SpeedioC00Updates-OWG`) contains active work-in-progress enhancements for the **Brother Speedio S500X2 / C00 Controller** equipped with a **Blum Laser NT Nano** and **Blum Z-Nano Touch** tool setter.
> Hardware execution on physical machine tools is in active verification.

---

## Overview

This repository builds upon Ed Wildgoose's Brother Speedio post-processor for Autodesk Fusion 360, incorporating extensive adaptations for high-speed machining, Blum laser tool setting, in-cycle tool wear/runout tracking, and crash-proof tool length offset management.

### Key Enhancements in v3.6 (WIP)

1. **Drill Taper Angle Units Fix (Radians to Degrees)**:
   - Fixed a critical unit conversion bug where Fusion 360 `tool.taperAngle` (stored in radians) was treated directly as degrees in `calculateLaserMeasurementGeometry()`.
   - Now properly converts radians to degrees (`tool.taperAngle * 180.0 / Math.PI`), preventing wild cone-height calculations (e.g., $Z167.0\text{ mm}$ on a 6mm drill) that would exceed Blum's `#109` $30.0\text{ mm}$ travel limit and trigger machine alarms.

2. **Lollipop End Mill Misclassification Fix**:
   - Prevented standard ball nose end mills with undefined shank/neck fields from erroneously defaulting to lollipop classification and triggering Blum `O8607` spherical contour scanning with $135^\circ$ sweeps.
   - Now requires explicit `neckDiameter < (diameter - 0.01)` or explicit tool comment/description identification.

3. **Inch (G20) Safe Geometry Conversions**:
   - Wrapped all fixed millimeter constants in `calculateLaserMeasurementGeometry()` with `toPreciseUnit(..., MM)` so inch programs scale offsets accurately.

4. **Dedicated Laser Runout Tolerance (`Q` Parameter)**:
   - Added `laserRunoutTolerance` post property (defaults to $0.025\text{ mm}$) for explicit control over Blum `O8603`/`O6009` per-edge runout tolerance.

5. **Brother C00 Macro B Syntax Hardening (`O6008.NC` & `O6009.NC`)**:
   - Converted all single-line `IF [...] #x = ...` conditional assignments to standard Brother Speedio C00 `IF [...] GOTO n` / assign / `Nn` branches per Section 6.4.2 of the C00 Programming Manual, eliminating `<< Macro Command Error >>` alarms.
   - Removed the restrictive $50\text{ mm}$ length gate that prevented measuring brand-new tools whose length was initialized at $0.0000$.
   - Renumbered duplicate sequence numbers `N50`/`N55` in `O6009.NC` to ensure unique GOTO dispatch targets.
   - Maintained strict $\le 80$ characters per block across all macro lines.

---

## Repository Contents

- **[`OWGMods-edwildgoose6-24-26-patched-v3_6.cps`](./OWGMods-edwildgoose6-24-26-patched-v3_6.cps)**: Fusion 360 post-processor configuration for Brother Speedio C00 (v3.6 WIP).
- **[`OWGMods-edwildgoose6-24-26-patched-v3_5.cps`](./OWGMods-edwildgoose6-24-26-patched-v3_5.cps)**: Preserved v3.5 post-processor snapshot.
- **[`macros/O6008.NC`](./macros/O6008.NC)**: Laser NT Tool Length measurement macro (wrapper calling Blum `O8602` or `O8603`).
- **[`macros/O6009.NC`](./macros/O6009.NC)**: In-cycle dynamic wear & runout measuring macro (injects nominal diameter into `#[13000+T]`, calls `O8603`, and immediately zeroes Cutter Comp geometry back to `0.0000`).

---

## Post Processor Configuration & Usage

### 1. Selectable Post Properties

| Property | Default | Description |
|---|---|---|
| `toolLengthSetter` | `laserNT` | Primary tool length setter: `Blum Laser NT (O6008)` or `Blum Z-Nano Touch (P8915)`. |
| `measureTools` | `false` | When true, measures tools at the start of the program. |
| `measureToolsList` | `all` | Comma-separated list of tool numbers to measure length at start (e.g. `1, 3, 5` or `all`). |
| `laserWearTools` | `""` | Comma-separated list of tool numbers to measure wear/runout with laser at start (e.g. `1, 3, 5` or `all`). |
| `laserRunoutTolerance` | `0.025` | Maximum allowable runout tolerance for Blum Laser NT wear macro `O6009` (Q parameter, mm). |
| `scanLollipopContour` | `false` | When true, lollipop cutters use Blum `O8607` spherical contour scanning instead of single-point equator wear measurement. |
| `probeResultsFormat` | `raw` | `raw` (native Blum print file via `V-1.`) or `fusion` (Renishaw-format DPRNT lines for Fusion import). |

### 2. Tool Comment Tags (Overrides)

You can tag individual tools in Fusion 360 by adding uppercase tags to the tool comment:
- `[LASER LEN]`: Forces Laser NT length measurement (`O6008`).
- `[ZNANO LEN]` or `[TOUCH LEN]`: Forces Z-Nano touch length measurement (`P8915`).
- `[LASER WEAR]`: Forces in-cycle and start-of-program laser wear/runout measurement (`O6009`).
- `[LASER SCAN]`: Forces Blum `O8607` spherical contour scan for lollipop cutters.
- `[LASER BREAK]`: Forces Laser NT tool breakage detection (`P8608`).
- `[ZNANO BREAK]` or `[TOUCH BREAK]`: Forces Z-Nano tool breakage detection (`P8915`).

*Note: Any tool with diameter $> 24.0\text{ mm}$ automatically routes to the Z-Nano touch setter to avoid physical collision with the Laser NT aperture housing.*

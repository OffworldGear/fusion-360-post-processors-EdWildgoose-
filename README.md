# Fusion 360 Post Processors: Brother Speedio C00 (OWG Modifications)

> [!WARNING]
> **WORK IN PROGRESS (NOT A FINAL RELEASE)**  
> This branch (`SpeedioC00Updates-OWG`) contains active work-in-progress enhancements for the **Brother Speedio S500X2 / C00 Controller** equipped with a **Blum Laser NT Nano** and **Blum Z-Nano Touch** tool setter.
> Hardware execution on physical machine tools is in active verification.

---

## Overview

This repository builds upon Ed Wildgoose's Brother Speedio post-processor for Autodesk Fusion 360, incorporating extensive adaptations for high-speed machining, Blum laser tool setting, in-cycle tool wear/runout tracking, and crash-proof tool length offset management.

### Key Enhancements in v3.5 (WIP)

1. **Tool Length Compensation (`G49`) Safety Hardening**:
   - Eliminates the hazard of Brother Alarm **SM4054** ("Tool length offset cancel error") by unconditionally retracting the Z-axis to machine reference (`G28` / `G53`) in `prepareForToolCheck()` before any tool check macro (`O6008`, `O6009`, `P8608`, `P8915`) is called.
   - Clears and resets the modal tool length compensation cache upon returning from tool measurement (`restoreModalStateAfterToolCheck()`), guaranteeing that `G43 H[tool.number]` is explicitly re-asserted on the initial approach move before cutting resumes.
   - Corrected operator precedence bug in legacy tool offset detection expressions.

2. **DPRNT Communication Protocol Hardening (Brother C00 Manual Ch 6.6)**:
   - **Raw Mode Port Collision Prevention (`CM4023` / `SM4041`)**: In `probeResultsFormat: "raw"`, post suppresses `POPEN`, `DPRNT[START]`, `DPRNT[END]`, and `PCLOS` because Blum's native measurement macro (`O8703` with `V-1.`) delegates output to `O8716.NC`, which opens and closes the RS-232 / Ethernet port internally.
   - **Illegal Character Sanitization**: Implemented `sanitizeDPRNT(text)` enforcing the C00 whitelist (`A-Z`, `0-9`, `()=/.+,-?*`) per Manual Sec 6.6.2 (Pg 265). Prohibited characters (`#`, `[`, `]`, `:`, `_`) are converted to valid equivalents to eliminate `<< Macro Command Error >>`.
   - **Session State Desync Fix**: `inspectionCreateResultsFileHeader()` accurately tracks `isDPRNTopen` across both probe cycles and surface inspection operations.
   - **Line Length Limit Enforcement**: Shortened decorative DPRNT separator lines to 40 characters so all emitted lines with sequence numbers stay well under the 80-character limit.

3. **Physics-Based Laser Measurement Geometry Engine**:
   - Replaced fixed percentage heuristics with `calculateLaserMeasurementGeometry(tool, measureType)` deriving exact radial offset ($X$) and axial height ($Z$) from Fusion 360 tool geometry:
     - **Flat End Mills**: Length at $X = [D / 2] \times 0.80$ (avoids center gash); wear at $Z = \text{clamp}(0.10, 0.50, L_f \times 0.20)$ on the peripheral flutes.
     - **Ball Nose Mills**: Length at $X = 0.0$ (apex tip); wear at $Z = D / 2.0$ (equator maximum OD).
     - **Bullnose / Radiused Mills**: Length at flat bottom face $X = [D / 2 - CR] \times 0.80$; wear at $Z = CR + 0.30\text{ mm}$ (safely above the corner radius).
     - **Twist Drills**: Drills are fully supported for laser wear/runout via `O6009`! The post calculates conical point height $Z_{point} = \frac{D/2}{\tan(\alpha/2)}$ and measures margin diameter at $Z = Z_{point} + 0.50\text{ mm}$. Length is measured via centric macro `O8602` ($X = 0.0, K = -3.0$).
     - **T-Slot Cutters / Slot Mills**: Length at cutting ring midpoint $X = \frac{D/2 + d_{neck}/2}{2}$; wear at disc thickness center $Z = L_f / 2.0$ ($K = -4.0$).
     - **Dovetail Cutters**: Length at bottom flat $X = [D / 2 - CR] \times 0.80$; wear at maximum bottom OD $Z = \max(0.10, CR + 0.15\text{ mm})$.
     - **Lollipop End Mills**: Equator wear check at $Z = D / 2.0$ via `O6009`. If spherical scanning is requested (via property `scanLollipopContour` or `[LASER SCAN]` tag), the post outputs Blum's dedicated contour scanning cycle **`O8607`** (`G65 P8607 H.. D.. C.. Q.. X0. I25. J[D/2] K135. V0. F100.`) to interpolate across the sphere into the neck undercut.

---

## Repository Contents

- **[`OWGMods-edwildgoose6-24-26-patched-v3_5.cps`](./OWGMods-edwildgoose6-24-26-patched-v3_5.cps)**: Fusion 360 post-processor configuration for Brother Speedio C00.
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

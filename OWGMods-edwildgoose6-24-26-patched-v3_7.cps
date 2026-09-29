/**
  Copyright (C) 2012-2026 by Autodesk, Inc.
  All rights reserved.

  Brother Speedio post processor configuration.

  $Revision: 44220 2b98af3e523dc041217e3860e4ea3f1fe5d949f9 $
  $Date: 2026-04-01 17:40:42 $

  FORKID {C09133CD-6F13-4DFC-9EB8-41260FBB5B08}

  NOTES:
  It's essential that you change:
  - "User Param Switch 1": 0039 (Travel of X, Y or Z axis when tool length/tool position offset is changed) to true.
    This allows the use of G49 without a Z param
  - "User Param Switch 1": 0053 (Multiple M codes in one block) to true.
    This allows the G100 tool change to start spindle + start coolant

  OWG Stage 1 patches (2026-06-22):
  - Fixed invalid default value "toolPath" for showSequenceNumbers (now "toolChange")
  - Removed unwired properties: wcsTolerance, wcsXShift/Y/Z, parkAAxisAngle
  - Removed compound G54.1+G54.2 WCS entries (probe encoding can't represent them)
  - Added groupDefinitions block for cleaner property dialog
  - Added resetProbeFeatureNumber property (default true) to control DPRNT feature counter
  - Restored probe pattern/mirror safety checks in writeProbeCycle
  - Made G54.2 cancel check robust against multi-line WCS strings (substring -> indexOf)
  - Multi-line WCS strings now emit one block per line (each gets its own N-number)
  - onClose now respects positionAtEnd == "noMove"
  - getRetractParameters: separated macro-string X home from numeric X home for machineSimulation
  - safeProbeFeedrate now converts to inches for ANY value when in inch mode (not just 5000)
  - Tightened DPRNT spoofing in onCycleEnd to cover walls/channels/rect, silence unknown cycles
  - Fixed pre-existing bug: lengthCompensationActive missing 'state.' prefix (line 2027)
  - Fixed pre-existing bug: 'retracted' undefined variable in COMMAND_VERIFY -> state.retractedZ
  - Fixed pre-existing bug: MOVEMENT_LINK_DIRECT duplicated in onMovement; added LINK_TRANSITION and HIGH_FEED

  OWG Stage 2 patches (2026-06-23):
  - CRITICAL: protectedProbeMove was using highFeedrate (20000 mm/min) for Z-up retracts
    and as fallback for cycleFeedrate. This tripped the Blum probe's skip signal between
    probe operations. Now uses safeProbeFeedrate throughout. (Regression from old post.)
  - Changed safePositionMethod default from G53 to G28 (universal Brother retract).
    G53 retract Z value can't be 0 on a typical Speedio - user must set
    machineConfiguration.setRetractPlane() explicitly if they want to use G53.
  - Restored probeResultsFormat property (raw / fusion) lost from older OWG version.
    'raw': Blum macro emits its native print file via V-1.
    'fusion': post emits Renishaw-format DPRNT lines that Fusion can import.

  OWG Stage 3 patch (2026-06-23):
  - CRITICAL FIX for SM4054 "Tool length offset cancel error" on Brother Speedio:
    Removed an assertion `state.retractedZ = true` that was set before writeToolCall.
    Stage 1's fix of the stray-global `retracted` variable (changed to state.retractedZ)
    inadvertently activated this latent code path - writeToolCall's internal writeRetract(Z)
    became a no-op, leaving its disableLengthCompensation(false) to emit a standalone G49
    with the spindle still at the previous op's clearance height (TLO active). On a
    Brother controller with Type 1 + check=Yes parameters, that trips SM4054 per the
    NC Programming manual section 4.2.3 Note 2 (G49 only safely cancels TLO when the
    spindle is at machine reference). Removing the false assertion lets writeRetract
    emit the required G91 G28 Z0 / G90 (or G90 G53 G0 Z0 if user chose G53) BEFORE
    the G49, restoring correct Brother behavior.
  - Fixed CM4023 "Print Open/Close error" in inspectionCreateResultsFileHeader:
    Commented out a stray writeBlock("PCLOS") that fires immediately before POPEN
    when no result file is open. Closing a non-existent file trips CM4023 on the
    Speedio. The legitimate PCLOS inside the 'if (isDPRNTopen)' guard above still
    runs when needed. Regression from the older DPRNT-fixed post.
  - CRITICAL FIX for SM4041 "POPEN is unable" on Brother Speedio with Blum probe:
    The Hi-Fly base post restricted printProbeResults() to Renishaw probes only:
      return (...printResults==1) && (probingType == "Renishaw");
    This caused inspectionCreateResultsFileHeader to return early on Blum probe ops,
    skipping the POPEN call. But this post's onCycleEnd DPRNT spoof STILL emitted
    DPRNT[...] lines for Blum, and per the NC Programming manual section 6.6.2 Note 1,
    DPRNT/BPRNT without a preceding POPEN fires the SM4041 "POPEN is unable" alarm.
    The fix: drop the probe-brand restriction from printProbeResults(), matching the
    older DPRNT-fixed post. The DPRNT spoof emits Renishaw-format output from Blum
    result variables, so POPEN/PCLOS bracketing is required regardless of probe brand.
  - Fixed centerAtDoor producing the invalid macro "[#5021-#50410]" for symmetric
    parts. When part-upper-x and part-lower-x are floating-point negatives of each
    other, their sum can be tiny-negative (e.g. -1.78e-15) instead of exactly zero.
    The old code chose sign based on the raw signed value but formatted the value
    afterward, so the minus sign was lost in formatting while sign stayed empty,
    producing "#5021-#5041" + "" + "0" = "#5021-#50410" - one continuous illegal
    macro variable that the controller rejects. Fix: format the absolute value
    first, then pick "+"/"-" with explicit handling of the formatted-to-zero case.

  OWG Stage 7 patches (2026-09-29) - v3_7 (TESTING - crash-safety review):
  See README.md for the full rationale. Verified against Brother C00 NC Programming
  Manual (eCOM3NCPR, 2020/02/26) and the Blum V5DE macros installed on the machine.
  - CRITICAL: Blum V5DE laser cycles exit (via O8639) with G91 + G49 active and the
    spindle at Z reference over the laser; Z-Nano P8915 exits with G43 active at its
    safe Z. restoreModalStateAfterToolCheck() now emits G28 Z reference, explicit
    G90 G17 G40 G80 G94 and G49, clears the rotation/WCS/axis caches, so the next
    section always re-sends WCS, work plane, and a full G43 approach move.
  - CRITICAL: Tool measure at a tool change (COMMAND_TOOL_MEASURE) now performs the
    full initial positioning (XY, then G43 Z H) after the measurement instead of
    relying on the G100 position that the measuring cycle moved away from.
  - CRITICAL: Laser length measurement only uses an off-centre X position on flat
    bottom tools (flat, bullnose, face, slot, dovetail). Every other type (chamfer,
    thread, form, corner-rounding, tapered, boring bar, engraving, unknown) is
    measured on centre via O8602 so the stored length can never be too short.
  - Refuses in-cycle Blum calls while a G68 probe rotation is active (Blum
    overwrites #100/#101/#143 that the G68 command was built from).
  - Tool measuring reorganised (numbered properties in the Probing group):
    1. Length method: Z-Nano only / Z-Nano + laser compare (default) / Laser only.
       "Compare" runs the laser in Blum control mode (B2, writes nothing) after
       each Z-Nano measurement so the laser can be proven before it becomes primary.
    2./3. Start-of-program length / wear: Off / Checked operations / All tools, with
       per-operation checkboxes (Post Process tab) replacing the tool number lists.
    4.-6. Per-tool Z-Nano list, Laser list and Never-measure list (also tags
       [ZNANO LEN], [LASER LEN], [NO MEASURE]). Tools the laser cannot handle fall
       back to the Z-Nano. A MEASUREMENT PLAN listing every tool is printed in the
       NC file header and the post log.
  - Cutter compensation guards: refuses "In control" and "Inverse wear" comp; for
    "Wear" comp, zeroes geometry and alarms if the wear register is outside
    'maxDiameterWear' before the operation starts; errors if D number != T number.
  - Program start guards: machine unit check via #4006 (the C00 has no G20/G21),
    interrupted laser measurement check via #580, geometry zeroed for all tools.
  - Blum laser features refuse to post in inch (Blum error E18).
  - Tapered mills no longer classified as centric ("tap" substring bug); ball
    detection uses TOOL_MILLING_END_BALL / TOOL_MILLING_LOLLIPOP.
  - Laser wear only allowed for tool types it can measure correctly.
  - Default toolBreakageTolerance 0.04 mm (was 0.0025 mm - false break alarms).
  - Laser macro arguments always carry a decimal point (<Program unit> safe).
  - Requires macros O6008/O6009 Rev C (macros/) and the O8670 A-axis edit (README).

  OWG Stage 6 patches (2026-09-29) - v3_6:
  - Version upgraded to v3_6.
  - Drill wear Z height radians unit fix: converted tool.taperAngle from radians
    to degrees before calculating cone height. Prevents Z167.0 out-of-bounds alarm.
  - Lollipop misclassification fix: only classify as lollipop if explicit reduced
    neck diameter is defined on the tool or tagged in comment/description. Prevents
    standard ball end mills from erroneously triggering P8607 spherical contour scan.
  - Full inch (G20) compatibility: wrapped all millimeter constants in
    calculateLaserMeasurementGeometry in toPreciseUnit(..., MM).
  - Added 'laserRunoutTolerance' post property: allows dedicated runout tolerance
    for Blum Laser NT wear/runout macro O6009 (Q parameter, defaults to 0.025mm).
  - Re-ordered docblocks for isLaserWearTool and writeLaserWearBlock.
  - Updated sanitizeDPRNT whitelist to allow parentheses () and asterisks * per
    Brother C00 NC Programming Manual Sec 6.6.2 Note 2.

  OWG Stage 5 patches (2026-09-29) - v3_5:
  - Version upgraded to v3_5.
  - Part 2 Section 3 Tool Length Offset (G49) Crash Safety Hardening:
    * In prepareForToolCheck(): unconditionally enforces writeRetract(Z) to machine
      reference (G28/G53) prior to tool check macro calls (O6008, O6009, P8608, P8915).
      This prevents Brother Alarm SM4054 and physical tool/part collisions on macro entry.
    * In restoreModalStateAfterToolCheck(): calls toolLengthCompOutput.reset() and
      clears state.lengthCompensationActive = false. Guarantees G43 H[tool.number]
      is re-commanded on initial approach move after tool measurement return.
    * Fixed legacy operator precedence bug in legacy offsetTool check:
      `(tool.type == TOOL_MILLING_SLOT || tool.type == TOOL_MILLING_FACE)`
  - DPRNT Communication Protocol Hardening (Brother C00 NC Programming Manual Ch 6.6):
    * Raw mode port collision fix: In probeResultsFormat == "raw", post suppresses
      POPEN, DPRNT[START], DPRNT[END], and PCLOS. The Blum macro O8703 (with V-1.)
      calls O8716.NC which handles port POPEN and PCLOS internally, preventing
      Brother Alarms CM4023 and SM4041.
    * Character sanitization: Added sanitizeDPRNT() whitelist [A-Z0-9 =/.\+,\-\?]
      per Manual Sec 6.6.2 Note 2 (Pg 265), preventing Macro Command Error alarms.
    * Inspection session desync fix: Updated inspectionCreateResultsFileHeader to track
      isDPRNTopen on both probe and inspection operations.
    * Line length limit: Shortened decorative DPRNT dashed banners to 40 characters max.
  - Precision Laser Measurement Geometry Engine:
    * Replaced fixed percentage heuristics with calculateLaserMeasurementGeometry()
      deriving exact radial offset (X) and axial height (Z) from Fusion tool models:
      - Flat End Mills: X = (D/2)*0.80, Z = clamp(0.10, 0.50, fluteLength*0.20).
      - Ball Nose Mills: X = 0.00, Z = D/2.0 (equator).
      - Bullnose Mills: X = (D/2 - CR)*0.80, Z = CR + 0.30mm (above corner radius).
      - Drills / Centric Tools: margin wear height Z = (D/2)/tan(alpha/2) + 0.50mm, X = 0.00.
        Drills are now supported in writeLaserWearBlock() for diameter wear/runout via O6009.
      - T-Slot Cutters: X = ((D/2) + (neckDia/2))/2, Z = fluteLength/2.0 (blade midpoint).
      - Dovetail Cutters: X = (D/2 - CR)*0.80, Z = max(0.10, CR + 0.15mm).
      - Lollipop End Mills: Equator diameter check (Z = D/2.0) via O6009 or full
        spherical contour arc scanning via Blum O8607 (I25. J[D/2] K135. V0. F100.).
    * Added 'scanLollipopContour' post property and '[LASER SCAN]' comment tag support.

  OWG Stage 4 patches (2026-09-28) - v3_4:
  - Version upgraded to v3_4.
  - Added 'toolLengthSetter' post property: enables selection between Blum Laser NT
    (O6008) and Blum Z-Nano Touch (P8915). Default: 'laserNT'.
  - Added 'measureToolsList' post property: comma-separated list of tool numbers
    (e.g. '1, 3, 5' or 'all') to selectively measure lengths at start. Supports
    T-prefixes (e.g. 'T1, T3') and ranges ('1-5', 'T1-T5').
  - Added 'laserWearTools' post property: comma-separated list of tool numbers
    (e.g. '1, 3, 5' or 'all') to selectively measure wear/runout at start. Supports
    T-prefixes, automatically filters out drills/taps/reamers and oversized tools (>24mm).
  - Tool comment tag parsing:
    * [LASER LEN] forces Blum Laser NT length measurement.
    * [ZNANO LEN] or [TOUCH LEN] forces Blum Z-Nano touch length measurement.
    * [LASER BREAK] forces Blum Laser NT tool breakage detection (P8608).
    * [ZNANO BREAK] or [TOUCH BREAK] forces Blum Z-Nano touch breakage detection (P8915).
    * [LASER WEAR] forces in-cycle / start-of-program laser wear/runout measurement (O6009).
    * Automatic safety fallback: any tool with diameter > 24.0mm automatically routes
      to Z-Nano touch setter to avoid laser aperture housing collision.
  - Tool Breakage Detection (COMMAND_BREAK_CONTROL):
    * Emits G65 P8608 for Laser NT or G65 P8915 for Z-Nano touch setter based on
      assigned setter, comment tags, and diameter limit.
    * Outputs descriptive uppercase comments explaining macro functions.
    * Strict 80-character per block limit verified.
  - Modal State & Wear Compensation Safety:
    * Emits #[13000 + tool.number] = 0.0000 (ENSURE WEAR MODE ZERO COMP) after every
      tool check macro call and at every tool change (G100 and manual M6) to guarantee
      cutter compensation geometry is zeroed before any motion.
    * Resets state.lengthCompensationActive = false, forceSpindleSpeed = true,
      forceWorkPlane(), and forceCoolant = true after any tool check macro.
  - Manual NC Actions:
    * Added support for in-cycle 'laser_wear' and 'measure_wear' actions (O6009).
    * Added support for in-cycle 'laser_length' and 'measure_length' actions.
*/

description = "Brother Speedio C00 (OWG v3.7 TESTING - Blum Laser & Z-Nano)";
vendor = "Brother";
vendorUrl = "http://www.brother.com";
legal = "Copyright (C) 2012-2026 by Autodesk, Inc, 2026 HiFly CNC";
certificationLevel = 2;
minimumRevision = 45917;

longDescription = "Generic milling post for use with all common Brother Speedio mills like S, W, R, U, F and H series machines.";

extension = "NC";
programNameIsInteger = false;
setCodePage("ascii");

capabilities = CAPABILITY_MILLING | CAPABILITY_MACHINE_SIMULATION;
tolerance = spatial(0.002, MM);
if (typeof revision == "number" && typeof supportedFeatures != "undefined") {
  supportedFeatures |= revision >= 50328 ? FEATURE_MACHINE_ROTARY_ANGLES : 0;
}

// Throw an error if duplicate tools are used
errorOnDuplicateTool = false;
// Turn on optimisations for production, trade speed for safety, etc
productionMode = false;
// Probe related
measureToolMaxDiameter = toPreciseUnit(20, MM);
measureAllFlutes = true;
measureProbe = false;

minimumChordLength = spatial(0.25, MM);
minimumCircularRadius = spatial(0.01, MM);
maximumCircularRadius = spatial(1000, MM);
minimumCircularSweep = toRad(0.01);
maximumCircularSweep = toRad(360);
allowHelicalMoves = true;
allowedCircularPlanes = undefined;
highFeedrate = (unit == MM) ? 20000 : 780;
probeMultipleFeatures = true;
// Prepend / on probe lines to allow skip with B.SKP
probeOutputAsOptional = false;
var probeFeatureNumber = 1;

// Group titles shown in the Fusion property dialog
groupDefinitions = {
  homePositions: {title:"Home Positions", order:10, collapsed:false},
  probing      : {title:"Probing", order:20, collapsed:false},
  multiAxis    : {title:"Multi-Axis", order:30, collapsed:false},
  configuration: {title:"Configuration", order:40, collapsed:false},
  preferences  : {title:"Preferences", order:50, collapsed:true},
  formats      : {title:"Formats", order:60, collapsed:true}
};

// user-defined properties
properties = {
  preloadTool: {
    title      : "Preload tool",
    description: "Preloads the next tool at a tool change (if any).",
    group      : "preferences",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  showSequenceNumbers: {
    title      : "Use sequence numbers",
    description: "'Yes' outputs sequence numbers on each block, 'Only on tool change' outputs sequence numbers on tool change blocks only, and 'No' disables the output of sequence numbers.",
    group      : "formats",
    type       : "enum",
    values     : [
      {title:"Yes", id:"true"},
      {title:"No", id:"false"},
      {title:"Only on tool change", id:"toolChange"}
    ],
    value: "toolChange",
    scope: "post"
  },
  sequenceNumberStart: {
    title      : "Start sequence number",
    description: "The number at which to start the sequence numbers.",
    group      : "formats",
    type       : "integer",
    value      : 10,
    scope      : "post"
  },
  sequenceNumberIncrement: {
    title      : "Sequence number increment",
    description: "The amount by which the sequence number is incremented by in each block.",
    group      : "formats",
    type       : "integer",
    value      : 5,
    scope      : "post"
  },
  optionalStop: {
    title      : "Optional stop",
    description: "Outputs optional stop code during when necessary in the code.",
    group      : "preferences",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  separateWordsWithSpace: {
    title      : "Separate words with space",
    description: "Adds spaces between words if 'yes' is selected.",
    group      : "formats",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  useRadius: {
    title      : "Radius arcs",
    description: "If yes is selected, arcs are outputted using radius values rather than IJK.",
    group      : "preferences",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  showNotes: {
    title      : "Show notes",
    description: "Writes operation notes as comments in the outputted code.",
    group      : "formats",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  partsCounter211: {
    title      : "Activate M211 parts counter",
    description: "Output M211 to activate parts counter",
    group      : "configuration",
    type       : "boolean",
    value      : true,
    scope      : "post",
  },
  partsCounter212: {
    title      : "Activate M212 parts counter",
    description: "Output M212 to activate parts counter",
    group      : "configuration",
    type       : "boolean",
    value      : false,
    scope      : "post",
  },
  partsCounter213: {
    title      : "Activate M213 parts counter",
    description: "Output M213 to activate parts counter",
    group      : "configuration",
    type       : "boolean",
    value      : false,
    scope      : "post",
  },
  partsCounter214: {
    title      : "Activate M214 parts counter",
    description: "Output M214 to activate parts counter",
    group      : "configuration",
    type       : "boolean",
    value      : false,
    scope      : "post",
  },
  hasAAxis: {
    title      : "Use A-axis",
    description: "Specifies whether to use the A axis.",
    group      : "configuration",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  useTrunnion: {
    title      : "Use AC-trunnion",
    description: "Enables a trunnion table with an A and C-axis.",
    group      : "configuration",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  probingType: {
    title      : "Probing type",
    description: "Specified what probing cycles are used on the machine.",
    group      : "probing",
    type       : "enum",
    values     : [
      {title:"Renishaw", id:"Renishaw"},
      {title:"Blum", id:"Blum"}
    ],
    value: "Blum",
    scope: "post"
  },
  resetProbeFeatureNumber: {
    title      : "Reset probe feature number per program",
    description: "When true, the DPRNT feature counter resets to 1 at the start of each posted program. When false, it keeps counting across posts in the same Fusion session.",
    group      : "probing",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  probeResultsFormat: {
    title      : "DPRNT Results Format",
    description: "Select the output format for probe measurement results. 'Blum Raw' emits V-1. on each probe call so the Blum macro produces its native, human-readable result file. 'Fusion 360 Import' instead synthesizes Renishaw-style DPRNT headers and SIZE/POSN lines (using Blum macro variables) so the result file can be consumed by Fusion's probe-results import.",
    group      : "probing",
    type       : "enum",
    values     : [
      {title:"Blum Raw / Human Readable", id:"raw"},
      {title:"Fusion 360 Import",         id:"fusion"}
    ],
    value      : "fusion",
    scope      : "post"
  },
  safeProbeFeedrate: {
    title      : "Safe probe feedrate",
    description: "Specifies the maximum positioning feedrate for the probe. Defaults to 5000 mm/min.",
    group      : "probing",
    type       : "number",
    value      : 5000,
    scope      : "post"
  },
  positionAtEnd: {
    title      : "Part position at cycle end",
    description: "'Center At Door' Moves the part in X in center under spindle at end of program. 'Home' Moves the table to the home position defined in the machine setup",
    group      : "homePositions",
    type       : "enum",
    values     : [
      {title:"Home", id:"home"},
      {title:"No Move", id:"noMove"},
      {title:"Center at Door", id:"centerAtDoor"}
    ],
    value      : "centerAtDoor",
    scope      : "post"
  },
  washdownCoolant: {
    title      : "Washdown coolant",
    description: "Specifies whether washdown coolant should be used and where it is output.",
    group      : "preferences",
    type       : "enum",
    values     : [
      {title:"Off", id:"off"},
      {title:"Always on", id:"always"},
      {title:"End of operation", id:"operationEnd"},
      {title:"Program end", id:"programEnd"}
    ],
    value: "programEnd",
    scope: "post"
  },
  usePitchForTapping: {
    title      : "Use Pitch/TPI for tapping",
    description: "Enables the use of pitch and threads per inch instead of feed for tapping cycles. Using G77/78 instead of G84/74.",
    group      : "preferences",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  doubleTapWithdrawSpeed: {
    title      : "Double the tap withdraw speed",
    description: "If enabled, an L value containing double the spindle speed (up to 6000) will be output in the G77 tapping cycle.",
    group      : "preferences",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  useClampCodes: {
    title      : "Use clamp codes",
    description: "Specifies whether clamp codes for rotary axes should be output. For simultaneous toolpaths rotary axes will always get unclamped.",
    group      : "multiAxis",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  tapAccel: {
    title      : "Override tap accelerations",
    description: "If the machine throws <<Servo error (overload)>>, then decrease tap accelerations.",
    group      : "preferences",
    type       : "enum",
    values     : [
      {title:"No Change", id:"-1"},
      {title:"High", id:"252"},
      {title:"Medium", id:"253"},
      {title:"Slow", id:"254"}
    ],
    value      : "-1",
    scope      : "post"
  },
  smoothingMode: {
    title      : "High accuracy mode",
    description: "Select the high accuracy mode supported by the control.",
    group      : "preferences",
    type       : "enum",
    values     : [
      {title:"A", id:"A"},
      {title:"B", id:"B"},
      {title:"M298", id:"M298"}
    ],
    value      : "M298",
    scope      : "post"
  },
  useSmoothing: {
    title      : "High accuracy level",
    description: "Select the high accuracy level to use for machining.",
    group      : "preferences",
    type       : "enum",
    values     : [
      {title:"Off", id:"-1"},
      {title:"Automatic", id:"9999"},
      {title:"Standard", id:"1"}, // 0
      {title:"Roughing", id:"2"}, // 5
      {title:"Medium rough", id:"3"}, // 3
      {title:"Medium rough (S)", id:"4"}, // 4
      {title:"Finishing", id:"5"}, // 1
      {title:"Finishing (S)", id:"6"} // 2
    ],
    value      : "9999",
    scope      : "post"
  },
  accuracyOverride: {
    title: "Accuracy mode",
    group: 0,
    description: "Override high accuracy mode for current operation",
    type: "enum",
    values: [
      {title:"No Change", id:"-9999"},
      {title:"Accuracy Off", id:"-1"},
      {title:"Automatic", id:"9999"},
      {title:"Standard", id:"1"},
      {title:"Roughing", id:"2"},
      {title:"Medium rough", id:"3"},
      {title:"Medium rough (S)", id:"4"},
      {title:"Finishing", id:"5"},
      {title:"Finishing (S)", id:"6"},
      {title:"Accuracy spec A", id:"21"},
      {title:"Accuracy spec B", id:"22"},
      {title:"Accuracy spec C", id:"23"}
    ],
    value: "-9999",
    scope : "operation",
    enabled : "milling",
  },
  smoothingCriteria: {
    title      : "Smoothing Criteria",
    description: "Select whether Stock to Leave or Tolerance is used for determining the automatic smoothing mode. Only used when High accuracy level is set to Automatic.",
    group      : "preferences",
    type       : "enum",
    values     : [
      {title:"Stock to Leave", id:"stock"},
      {title:"Tolerance", id:"tolerance"},
    ],
    value      : "stock",
    scope      : "post"
  },
  useMachiningLoadMonitor: {
    title      : "Machining Load Monitor",
    description: "Specifies if the Machining Load Monitor code (M341/M342/M343) should be output in nc code.",
    group      : "preferences",
    type       : "enum",
    values     : [
      {title:"Off", id:"-1"},
      {title:"M341 ON", id:"341"},
      {title:"M342 ON-MAX ONLY", id:"342"},
      {title:"M343 ON-MIN ONLY", id:"343"},
    ],
    value: "-1",
    scope: "post"
  },
  rapidTransitions: {
    title      : "Disable smoothing during transitions",
    description: "Turn off accuracy modes during leads in/out and non cutting moves. Generally faster, but beware moves may deviate from simulation. ONLY useable with M298. Currently only affects Adaptive & 2D Pocket",
    group      : "preferences",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  useInverseTime: {
    title      : "Use inverse time feedrates",
    description: "'Yes' enables inverse time feedrates, 'No' outputs DPM feedrates.",
    group      : "multiAxis",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  safePositionMethod: {
    title      : "Safe Retracts",
    description: "Select your desired retract option. 'G28' is universal (uses incremental return to reference point 1 - always safe on Brother Speedio). 'G53' requires machineConfiguration.setRetractPlane() to be set to a valid machine-Z value. 'Clearance Height' retracts to the operation clearance height.",
    group      : "homePositions",
    type       : "enum",
    values     : [
      {title:"G28", id: "G28"},
      {title:"G53", id:"G53"},
      {title:"Clearance Height", id:"clearanceHeight"}
    ],
    value: "G28",
    scope: "post"
  },
  useTiltedWorkplane: {
    title      : "Use G68.2",
    description: "Enable to use G68.2 for 3+2 operations.",
    group      : "multiAxis",
    type       : "boolean",
    value      : false,
    scope      : "machine"
  },
  separateZOnToolChange: {
    title      : "Tool change G100 moves in XY, then Z",
    description: "Non Speedio devices with a fixed tool change position will travel in a straight line if false. When true, they make a dog leg across XY first, then Z",
    group      : "homePositions",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  // ---------------------------------------------------------------------------
  // OWG v3_7 TOOL MEASURING (Blum Z-Nano + Laser NT). Titles are numbered so they read
  // top-down in the Fusion dialog. Per-tool priority for length:
  //   Never measure list / [NO MEASURE]  >  Z-Nano list / [ZNANO LEN]  >
  //   Laser list / [LASER LEN]  >  Length method.
  // Tools the laser cannot handle (> 24 mm, not metric) always fall back to the Z-Nano.
  // ---------------------------------------------------------------------------
  lengthMethod: {
    title      : "1. Length method (default for all tools)",
    description: "How tool length is measured unless a tool is listed/tagged otherwise. 'Z-Nano + laser compare' sets the length with the Z-Nano, then re-measures with the Laser NT in Blum compare-only mode (O6008 B2, writes nothing, alarms if the difference exceeds the compare tolerance, difference stored in #582). Use it to prove the laser before switching to 'Laser only'.",
    group      : "probing",
    type       : "enum",
    values     : [
      {title:"Z-Nano only", id:"znano"},
      {title:"Z-Nano + laser compare", id:"znanoCompare"},
      {title:"Laser only", id:"laser"}
    ],
    value      : "znanoCompare",
    scope      : "post"
  },
  startLengthMeasure: {
    title      : "2. Measure length at program start",
    description: "Which tools get their length measured at the start of the program (block-skippable with B.SKP). 'Checked operations' = tools used by an operation whose Post Process tab has 'Measure tool length at start' ticked. The Never-measure list always wins.",
    group      : "probing",
    type       : "enum",
    values     : [
      {title:"Off", id:"off"},
      {title:"Checked operations", id:"checked"},
      {title:"All tools", id:"all"}
    ],
    value      : "checked",
    scope      : "post"
  },
  startWearCheck: {
    title      : "3. Laser wear check at program start",
    description: "Which tools get an O6009 laser wear/runout check at program start. 'Checked operations' = tools used by an operation with 'Laser wear check at start' ticked, or tagged [LASER WEAR]. Only supported tool types <= 24 mm are checked. Needs a length already in the tool table.",
    group      : "probing",
    type       : "enum",
    values     : [
      {title:"Off", id:"off"},
      {title:"Checked operations", id:"checked"},
      {title:"All tools", id:"all"}
    ],
    value      : "checked",
    scope      : "post"
  },
  lengthZnanoTools: {
    title      : "4. Z-Nano only tools",
    description: "Tool numbers always measured with the Z-Nano and never with the laser (e.g. '3, 12' or '20-25'). Same as the [ZNANO LEN] tag.",
    group      : "probing",
    type       : "string",
    value      : "",
    scope      : "post"
  },
  lengthLaserTools: {
    title      : "5. Laser tools",
    description: "Tool numbers measured with the Laser NT (O6008 B3, writes the length). Same as the [LASER LEN] tag. Tools the laser cannot handle fall back to the Z-Nano.",
    group      : "probing",
    type       : "string",
    value      : "",
    scope      : "post"
  },
  excludeTools: {
    title      : "6. Never measure tools",
    description: "Tool numbers that are never measured (length or wear), e.g. tools too big for either setter. Same as the [NO MEASURE] tag. An in-cycle Manual NC measurement of one of these tools is refused at post time.",
    group      : "probing",
    type       : "string",
    value      : "",
    scope      : "post"
  },
  laserLengthCompareTolerance: {
    title      : "Laser compare tolerance (mm)",
    description: "Maximum allowed difference between the Z-Nano length and the Laser NT length before Blum alarms (O6008 B2 Q, mm).",
    group      : "probing",
    type       : "number",
    value      : 0.02,
    scope      : "post"
  },
  maxDiameterWear: {
    title      : "Max diameter wear for Wear comp (mm)",
    description: "Before any operation using Fusion 'Wear' compensation the post emits a check that alarms (9121) if |#[12000+D]| exceeds this value, and zeroes the cutter comp geometry #[13000+D]. Also passed to O6009 as U.",
    group      : "probing",
    type       : "number",
    value      : 0.1,
    scope      : "post"
  },
  laserRunoutTolerance: {
    title      : "Laser runout tolerance (mm)",
    description: "Maximum allowable runout per cutting edge for the O6009 laser wear check (Q, mm).",
    group      : "probing",
    type       : "number", // laser cycles are metric-only, so this is always mm
    value      : 0.025,
    scope      : "post"
  },
  toolBreakageTolerance: {
    title      : "Tool breakage detect tolerance",
    description: "Tolerance at which tool break detection raises an alarm (Q of Blum Laser NT P8608 and Z-Nano P8915 B2). Break detection itself is switched on per tool in Fusion (Break control).",
    group      : "probing",
    type       : "spatial",
    value      : 0.04, // OWG v3_7: was 0.0025 (2.5 um) which trips false break alarms; Blum example O6018 uses Q0.04
    scope      : "post"
  },
  scanLollipopContour: {
    title      : "Scan lollipop contour with laser",
    description: "When true, lollipop cutters use Blum O8607 spherical contour scanning instead of single-point equator wear measurement.",
    group      : "probing",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  // OWG v3_7: per-operation checkboxes (operation dialog > Post Process tab)
  opMeasureLength: {
    title      : "Measure tool length at start",
    group      : 0,
    description: "Include this operation's tool in the start-of-program length measurement (when '2. Measure length at program start' = Checked operations).",
    type       : "boolean",
    value      : false,
    scope      : "operation",
    enabled    : "milling"
  },
  opLaserWear: {
    title      : "Laser wear check at start",
    group      : 0,
    description: "Include this operation's tool in the start-of-program O6009 laser wear check (when '3. Laser wear check at program start' = Checked operations).",
    type       : "boolean",
    value      : false,
    scope      : "operation",
    enabled    : "milling"
  },
  confirmToolLengths: {
    title      : "Confirm tool lengths",
    description: "Ensure that the actual tool lengths are equal or longer to that specified in CAM.",
    group      : "probing",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  singleResultsFile: {
    title      : "Create single results file",
    description: "Set to false if you want to store the measurement results for each probe / inspection toolpath in a separate file",
    group      : "probing",
    type       : "boolean",
    value      : true,
    scope      : "post"
  }
};

// wcs definiton
wcsDefinitions = {
  useZeroOffset: false,
  wcs          : [
    {name:"Standard", format:"G", range:[54, 59]},
    {name:"Extended", format:"G54.1 P", range:[1, 300]},
    // Compound WCS entries: standard work offset on its own line, G54.2 P on the next.
    // The newline is intentional - Brother's C00 controller requires G54.2 to be on its own block.
    {name:"G54 G54.2Pn Rotary",  format:"G54\nG54.2 P",  range:[1, 8]},
    {name:"G55 G54.2Pn Rotary",  format:"G55\nG54.2 P",  range:[1, 8]},
    {name:"G56 G54.2Pn Rotary",  format:"G56\nG54.2 P",  range:[1, 8]},
    {name:"G57 G54.2Pn Rotary",  format:"G57\nG54.2 P",  range:[1, 8]},
    {name:"G58 G54.2Pn Rotary",  format:"G58\nG54.2 P",  range:[1, 8]},
    {name:"G59 G54.2Pn Rotary",  format:"G59\nG54.2 P",  range:[1, 8]}
  ]
};

var gFormat = createFormat({prefix:"G", minDigitsLeft:1, decimals:1});
var mFormat = createFormat({prefix:"M", minDigitsLeft:1, decimals:1});
var hFormat = createFormat({prefix:"H", minDigitsLeft:2, decimals:1});
var diameterOffsetFormat = createFormat({prefix:"D", minDigitsLeft:2, decimals:1});
var probeWCSFormat = createFormat({decimals:0, type:FORMAT_REAL});

// Format definitions sized for the Brother Speedio sub-micron option:
// 4 decimal places in MM (0.0001 mm = 0.1 µm), 5 decimal places in IN.
var xyzFormat = createFormat({decimals:(unit == MM ? 4 : 5), forceDecimal:false});
var ijkFormat = createFormat({decimals:6, type:FORMAT_REAL}); // unitless
var rFormat = xyzFormat; // radius
var abcFormat = createFormat({decimals:4, forceDecimal:true, scale:DEG});
var feedFormat = createFormat({decimals:(unit == MM ? 0 : 1)});
var inverseTimeFormat = createFormat({decimals:3, type:FORMAT_REAL});
var toolFormat = createFormat({minDigitsLeft:2, decimals:1});
var rpmFormat = createFormat({decimals:0});
var secFormat = createFormat({decimals:3, type:FORMAT_REAL}); // seconds - range 0.001-99999.999
var taperFormat = createFormat({decimals:1, scale:DEG});

var xOutput = createOutputVariable({onchange:function() {state.retractedX = false;}, prefix:"X"}, xyzFormat);
var yOutput = createOutputVariable({onchange:function() {state.retractedY = false;}, prefix:"Y"}, xyzFormat);
var zOutput = createOutputVariable({onchange:function() {state.retractedZ = false;}, prefix:"Z"}, xyzFormat);
var aOutput = createOutputVariable({prefix:"A"}, abcFormat);
var bOutput = createOutputVariable({prefix:"B"}, abcFormat);
var cOutput = createOutputVariable({prefix:"C"}, abcFormat);
var feedOutput = createOutputVariable({prefix:"F"}, feedFormat);
var inverseTimeOutput = createOutputVariable({prefix:"F", control:CONTROL_FORCE}, inverseTimeFormat);
var cyclefeedOutput = createOutputVariable({prefix:"F", control:CONTROL_FORCE}, feedFormat);
var sOutput = createOutputVariable({prefix:"S", control:CONTROL_FORCE}, rpmFormat);

// circular output
var iOutput = createOutputVariable({prefix:"I", control:CONTROL_NONZERO}, xyzFormat);
var jOutput = createOutputVariable({prefix:"J", control:CONTROL_NONZERO}, xyzFormat);
var kOutput = createOutputVariable({prefix:"K", control:CONTROL_NONZERO}, xyzFormat);

var gMotionModal = createOutputVariable({control:CONTROL_FORCE}, gFormat); // modal group 1 // G0-G3, ...
var gPlaneModal = createOutputVariable({onchange:function () {gMotionModal.reset();}}, gFormat); // modal group 2 // G17-19
var gAbsIncModal = createOutputVariable({}, gFormat); // modal group 3 // G90-91
var gFeedModeModal = createOutputVariable({}, gFormat); // modal group 5 // G94-95
var gUnitModal = createOutputVariable({}, gFormat); // modal group 6 // G20-21
var gCycleModal = createOutputVariable({control:CONTROL_FORCE}, gFormat); // modal group 9 // G81, ...
var gRetractModal = createOutputVariable({}, gFormat); // modal group 10 // G98-99
var fourthAxisClamp = createOutputVariable({}, mFormat);
var fifthAxisClamp = createOutputVariable({}, mFormat);
var sixthAxisClamp = createOutputVariable({}, mFormat);
var washdownModal = createOutputVariable({}, mFormat);
var machineLoadMonitorOutput = createOutputVariable({current:340}, mFormat);

var settings = {
  coolant: {
    // samples:
    // {id: COOLANT_THROUGH_TOOL, on: 88, off: 89}
    // {id: COOLANT_THROUGH_TOOL, on: [8, 88], off: [9, 89]}
    // {id: COOLANT_THROUGH_TOOL, on: "M88 P3 (myComment)", off: "M89"}
    coolants: [
      {id:COOLANT_FLOOD, on:8},
      {id:COOLANT_MIST},
      {id:COOLANT_THROUGH_TOOL, on:494, off:495},
      {id:COOLANT_AIR, on: 402, off: 403},
      {id:COOLANT_AIR_THROUGH_TOOL},
      {id:COOLANT_SUCTION},
      {id:COOLANT_FLOOD_MIST},
      {id:COOLANT_FLOOD_THROUGH_TOOL, on:[8, 494], off:[9, 495]},
      {id:COOLANT_OFF, off:9}
    ],
    singleLineCoolant: false, // specifies to output multiple coolant codes in one line rather than in separate lines
  },
  smoothing: {
    off                   : -1, // disabled
    normal                : 1, // general purpose, optimised settings
    roughing              : 2, // roughing level for smoothing in automatic mode
    semi                  : 4, // semi-roughing level for smoothing in automatic mode
    semifinishing         : 1, // semi-finishing level for smoothing in automatic mode
    finishing             : 5, // finishing level for smoothing in automatic mode
    finishingS            : 6, // finishing with smoothing
    thresholdRoughing     : toPreciseUnit(0.5, MM), // operations with stock/tolerance at/above that threshold will use roughing level in automatic mode
    thresholdFinishing    : toPreciseUnit(0.05, MM), // operations with stock/tolerance at/below that threshold will use finishing level in automatic mode
    thresholdSemiFinishing: toPreciseUnit(0.1, MM), // operations with stock/tolerance at/below that threshold (and above threshold finishing) will use semi finishing level in automatic mode

    differenceCriteria: "level", // options: "level", "tolerance", "both". Specifies criteria when output smoothing codes
    autoLevelCriteria : "stock", // use "stock" or "tolerance" to determine levels in automatic mode
    cancelCompensation: false // tool length compensation must be canceled prior to changing the smoothing level
  },
  retract: {
    cancelRotationOnRetracting: false, // specifies that rotations (G68) need to be canceled prior to retracting
    methodXY                  : "G53", // special condition, overwrite retract behavior per axis
    methodZ                   : getProperty("safePositionMethod"), // special condition, overwrite retract behavior per axis
    useZeroValues             : ["G28", "G30"], // enter property value id(s) for using "0" value instead of machineConfiguration axes home position values (ie G30 Z0)
    homeXY                    : {onIndexing:false, onToolChange:false, onProgramEnd:{axes:[X, Y]}} // Specifies when XY should be homed in XY (sample: onIndexing:[X,Y]). Options can be combined
  },
  parametricFeeds: {
    firstFeedParameter    : 500, // specifies the initial parameter number to be used for parametric feedrate output
    feedAssignmentVariable: "#", // specifies the syntax to define a parameter
    feedOutputVariable    : "F#" // specifies the syntax to output the feedrate as parameter
  },
  machineAngles: { // refer to https://cam.autodesk.com/posts/reference/classMachineConfiguration.html#a14bcc7550639c482492b4ad05b1580c8
    controllingAxis: ABC,
    type           : PREFER_PREFERENCE,
    options        : ENABLE_ALL
  },
  workPlaneMethod: {
    useTiltedWorkplane    : false, // specifies that tilted workplanes should be used (ie. G68.2, G254, PLANE SPATIAL, CYCLE800), can be overwritten by property
    eulerConvention       : EULER_ZXZ_R, // specifies the euler convention (ie EULER_XYZ_R), set to undefined to use machine angles for TWP commands ('undefined' requires machine configuration)
    eulerCalculationMethod: "standard", // ('standard' / 'machine') 'machine' adjusts euler angles to match the machines ABC orientation, machine configuration required
    cancelTiltFirst       : true, // cancel tilted workplane prior to WCS (G54-G59) blocks
    forceMultiAxisIndexing: false, // force multi-axis indexing for 3D programs
    optimizeType          : OPTIMIZE_AXIS // can be set to OPTIMIZE_NONE, OPTIMIZE_BOTH, OPTIMIZE_TABLES, OPTIMIZE_HEADS, OPTIMIZE_AXIS. 'undefined' uses legacy rotations
  },
  comments: {
    permittedCommentChars: " abcdefghijklmnopqrstuvwxyz0123456789!\"#$&'*+.,;:/@<=>?_-[]{}", // letters are not case sensitive, use option 'outputFormat' below. Set to 'undefined' to allow any character
    prefix               : "(", // specifies the prefix for the comment
    suffix               : ")", // specifies the suffix for the comment
    outputFormat         : "upperCase", // can be set to "upperCase", "lowerCase" and "ignoreCase". Set to "ignoreCase" to write comments without upper/lower case formatting
    maximumLineLength    : 80 // the maximum number of characters allowed in a line, set to 0 to disable comment output
  },
  probing: {
    macroCall              : gFormat.format(65), // specifies the command to call a macro
    probeAngleMethod       : undefined, // supported options are: OFF, AXIS_ROT, G68, G54.4. 'undefined' uses automatic selection
    probeAngleVariables    : {
      Renishaw: {x:"#135", y:"#136", z:0, i:0, j:0, k:1, r:"#144", baseParamG54x4:26000, baseParamAxisRot:5200, method:0}, // specifies variables for the angle compensation macros, method 0 = Fanuc, 1 = Haas
      Blum:     {x:"#100", y:"#101", z:0, i:0, j:0, k:1, r:"#143", baseParamG54x4:26000, baseParamAxisRot:5200, method:0} // specifies variables for the angle compensation macros, method 0 = Fanuc, 1 = Haas
    },
    allowIndexingWCSProbing: false, // specifies that probe WCS with tool orientation is supported
    probeOn                : false // whether the probe is activated for probing
  },
  maximumSequenceNumber: 999999, // the maximum sequence number (Nxxx), use 'undefined' for unlimited
  polarCycleExpandMode : 1 // 0=EXPAND_NONE: Does not expand any cycles. 1=EXPAND_TCP: Expands drilling cycles, when TCP is on. 2=EXPAND_NON_TCP: Expands drilling cycles, when TCP is off. 3=EXPAND_ALL: Expands all drilling cycles
};

var washdownCoolant = {on:400, off:401};
var currentToolNumber = undefined;

var probeVariables = {
  outputRotationCodes: false, // determines if it is required to output rotation codes
  compensationXY     : undefined,
  probeAngleMethod   : undefined
};

var compensateToolLength = false; // add the tool length to the pivot distance for nonTCP rotary heads

var toolChecked = false; // specifies that the tool has been checked with the probe
var measureTool = false;

var jobDescription = "";
var firstNote = true; // handles output of notes from multiple setups

function defineMachine() {
  if ((getProperty("useTrunnion") || getProperty("hasAAxis")) && (receivedMachineConfiguration && machineConfiguration.isMultiAxisConfiguration())) {
    error(localize("You can only select either a machine in the CAM setup or use the properties to define your kinematics."));
  }

  var useTCP = false;
  // Some defaults if no machine config provided
  if (!receivedMachineConfiguration) {
    machineConfiguration.setHomePositionZ(toUnit(480, MM));
  }

  if (getProperty("useTrunnion")) {
    var aAxis = createAxis({coordinate:0, table:true, axis:[1, 0, 0], range:[-30, 120], preference:1, tcp:useTCP});
    var cAxis = createAxis({coordinate:2, table:true, axis:[0, 0, 1], cyclic:true, tcp:useTCP});
    machineConfiguration = new MachineConfiguration(aAxis, cAxis);
    setMachineConfiguration(machineConfiguration);
    if (receivedMachineConfiguration) {
      warning(localize("The provided CAM machine configuration is overwritten by the postprocessor."));
      receivedMachineConfiguration = false; // CAM provided machine configuration is overwritten
    }
  } else if (getProperty("hasAAxis")) { // note: setup your machine here
    var aAxis = createAxis({coordinate:0, table:true, axis:[1, 0, 0], range:[-360, 360], preference:1, tcp:useTCP});
    machineConfiguration = new MachineConfiguration(aAxis);
    setMachineConfiguration(machineConfiguration);
    if (receivedMachineConfiguration) {
      warning(localize("The provided CAM machine configuration is overwritten by the postprocessor."));
      receivedMachineConfiguration = false; // CAM provided machine configuration is overwritten
    }
  }

  if (!receivedMachineConfiguration) {
    // multiaxis settings
    if (machineConfiguration.isHeadConfiguration()) {
      machineConfiguration.setVirtualTooltip(false); // translate the pivot point to the virtual tool tip for nonTCP rotary heads
    }

    // retract / reconfigure
    var performRewinds = false; // set to true to enable the rewind/reconfigure logic
    if (performRewinds) {
      machineConfiguration.enableMachineRewinds(); // enables the retract/reconfigure logic
      safeRetractDistance = (unit == IN) ? 1 : 25; // additional distance to retract out of stock, can be overridden with a property
      safeRetractFeed = (unit == IN) ? 20 : 500; // retract feed rate
      safePlungeFeed = (unit == IN) ? 10 : 250; // plunge feed rate
      machineConfiguration.setSafeRetractDistance(safeRetractDistance);
      machineConfiguration.setSafeRetractFeedrate(safeRetractFeed);
      machineConfiguration.setSafePlungeFeedrate(safePlungeFeed);
      var stockExpansion = new Vector(toPreciseUnit(0.1, IN), toPreciseUnit(0.1, IN), toPreciseUnit(0.1, IN)); // expand stock XYZ values
      machineConfiguration.setRewindStockExpansion(stockExpansion);
    }

    // multi-axis feedrates
    if (machineConfiguration.isMultiAxisConfiguration()) {
      machineConfiguration.setMultiAxisFeedrate(
        useTCP ? FEED_FPM : getProperty("useInverseTime") ? FEED_INVERSE_TIME : FEED_DPM,
        9999.999, // maximum output value for inverse time feed rates
        getProperty("useInverseTime") ? INVERSE_MINUTES : DPM_COMBINATION, // INVERSE_MINUTES/INVERSE_SECONDS or DPM_COMBINATION/DPM_STANDARD
        0.5, // tolerance to determine when the DPM feed has changed
        0.1 // ratio of rotary accuracy to linear accuracy for DPM calculations
      );
      setMachineConfiguration(machineConfiguration);
    }

    /* home positions */
    // machineConfiguration.setHomePositionX(toPreciseUnit(0, IN));
    // machineConfiguration.setHomePositionY(toPreciseUnit(0, IN));
    // machineConfiguration.setRetractPlane(toPreciseUnit(0, IN));
  }
}

// Convert angles from <0 degrees to positive
function ensurePositiveAngle(angle) {
  if (angle < 0) {
    return angle + 360.0;
  } else {
    return angle;
  }
}

function noSpindle() {
  // Do not output D, S, M3/4 during G100 for Tap/Probe operations
  var noSpindle = isTappingCycle(currentSection) || tool.type == TOOL_PROBE;
  return noSpindle;
}

function onOpen() {
  // define and enable machine configuration
  receivedMachineConfiguration = machineConfiguration.isReceived();
  if (typeof defineMachine == "function") {
    defineMachine(); // hardcoded machine configuration
  }
  if (machineConfiguration.isHeadConfiguration()) {
    error(localize("This post processor does not support head configuration machines."));
  }
  activateMachine(); // enable the machine optimizations and settings

  setAllowedCircularPlanes(-1);

  if (!getProperty("separateWordsWithSpace")) {
    setWordSeparator("");
  }

  if (getProperty("useRadius")) {
    maximumCircularSweep = toRad(90); // avoid potential center calculation errors for CNC
  }
  washdownModal.format(washdownCoolant.off);

  // setup for proper smoothing mode
  switch (getProperty("smoothingMode")) {
  case "A":
  case "B":
    settings.smoothing.roughing = 5;
    settings.smoothing.semi = 3;
    settings.smoothing.semifinishing = 1;
    settings.smoothing.finishing = 2;
    break;
  }
  settings.smoothing.autoLevelCriteria = getProperty("smoothingCriteria");

  fourthAxisClamp.format(443); // Default 4th axis modal code to be clamped
  fifthAxisClamp.format(441); // Default 5th axis modal code to be clamped
  sixthAxisClamp.format(445); // Default 6th axis modal code to be clamped

  if (programName) {
    writeComment(programName + conditional(programComment, SP + formatComment(programComment)));
  } else {
    error(localize("Program name has not been specified."));
  }

  sequenceNumber = getProperty("sequenceNumberStart");

  // Reset the DPRNT feature counter for this program if configured to do so.
  if (getProperty("resetProbeFeatureNumber")) {
    probeFeatureNumber = 1;
  }

  writeProgramHeader();
  writeProgramStartGuards(); // OWG v3_7: unit / interrupted-measurement / cutter comp guards
  writeMeasureTools();

  if (typeof inspectionWriteVariables == "function") {
    inspectionWriteVariables();
  }

  // absolute coordinates and feed per min
  // OWG v3_7: force output - the block-skippable measuring section above updates the
  // modal caches, so with B.SKP ON these codes would otherwise be suppressed.
  forceModals();
  toolLengthCompOutput.reset();
  writeBlock(gMotionModal.format(0), gAbsIncModal.format(90), gFormat.format(40), gFormat.format(80));
  writeBlock(gFeedModeModal.format(94), toolLengthCompOutput.format(49));
  // Convenient to emit the WCS code for the first section
  if (getNumberOfSections() > 0) {
    writeBlock(getSection(0).wcs);
  }

  // Tap accel
  var tapAccel = parseInt(getProperty("tapAccel", "-1"), 10);
  if (!isNaN(tapAccel) && (tapAccel > 0)) {
    writeBlock(mFormat.format(tapAccel))
  }

  writeComment("File output in " + (unit == 1 ? "MM" : "inches") + ". Please ensure the unit is set correctly on the control");
  validateCommonParameters();
}

function setSmoothing(mode) {
  if (mode == smoothing.isActive && (!mode || !smoothing.isDifferent) && !smoothing.force) {
    return; // return if smoothing is already active or is not different
  }
  if (validateLengthCompensation && settings.smoothing.cancelCompensation) {
    validate(!state.lengthCompensationActive, "Length compensation is active while trying to update smoothing.");
  }

  switch (getProperty("smoothingMode")) {
  case "A":
    writeBlock(mFormat.format(mode ? 260 + smoothing.level : 269));
    break;
  case "B":
    writeBlock(mFormat.format(mode ? 280 + smoothing.level : 289));
    break;
  default:
    writeBlock(mFormat.format(298), mode ? "L" + smoothing.level : "L0");
    break;
  }
  smoothing.isActive = mode;
  smoothing.force = false;
  smoothing.isDifferent = false;
}

function printProbeResults() {
  // Return true if "Print Results" is checked in Fusion, regardless of probe brand.
  // This allows the POPEN command and Fusion headers to be generated for Blum probes
  // too - the Hi-Fly base only allowed Renishaw, but this post's DPRNT spoof in
  // onCycleEnd produces Renishaw-format output from Blum result variables, so the
  // POPEN/PCLOS bracketing needs to fire for Blum as well. Without this fix, DPRNT
  // lines are emitted in onCycleEnd without a preceding POPEN, tripping the
  // Brother SM4041 "POPEN is unable" alarm.
  return (currentSection.getParameter("printResults", 0) == 1);
}

function onSection() {
  var forceSectionRestart = optionalSection && !currentSection.isOptional();
  optionalSection = currentSection.isOptional() || (isProbeOperation() && probeOutputAsOptional);
  var insertToolCall = isToolChangeNeeded("number") || forceSectionRestart;
  var newWorkOffset = isNewWorkOffset() || forceSectionRestart;
  var newWorkPlane = isNewWorkPlane() || forceSectionRestart || (typeof defineWorkPlane == "function" &&
    Vector.diff(defineWorkPlane(getPreviousSection(), false), defineWorkPlane(currentSection, false)).length > 1e-4);

  writeln("");
  writeComment(getParameter("operation-comment", ""));

  if (getProperty("showNotes")) {
    writeSectionNotes();
  }

  initializeSmoothing(); // initialize smoothing mode

  if (insertToolCall || newWorkOffset || newWorkPlane || smoothing.cancel || state.tcpIsActive || currentSection.isMultiAxis()) {
    if (!insertToolCall || newWorkOffset || newWorkPlane || state.tcpIsActive || currentSection.isMultiAxis()) {
      writeRetract(Z); // retract
      disableLengthCompensation();
    }
    if (isFirstSection()) {
      cancelWorkPlane(machineConfiguration.isMultiAxisConfiguration() && settings.workPlaneMethod.useTiltedWorkplane);
      if (machineConfiguration.isMultiAxisConfiguration()) {
        positionABC(new Vector(0, 0, 0));
      }
      forceABC();
    } else {
      if (insertToolCall || newWorkPlane) {
        cancelWorkPlane();
      }
      if (insertToolCall || smoothing.cancel) {
        setSmoothing(false);
      }
    }
  }

  if (toolChecked) {
    forceSpindleSpeed = true; // spindle must be restarted if tool is checked without a tool change
    toolChecked = false; // state of tool is not known at the beginning of a section since it could be broken for the previous section
  }

  // set wcs
  var wcsIsRequired = true;
  if (insertToolCall) {
    currentWorkOffset = undefined; // force work offset when changing tool
    wcsIsRequired = newWorkOffset || insertToolCall;
    writeBlock(gRotationModal.format(69)); // cancel frame
  }
  writeWCS(currentSection, wcsIsRequired);

  if (insertToolCall) {
    if (tool.manualToolChange) {
      error(localize("Manual tool change is not supported by this postprocessor."));
    }
    if (settings.workPlaneMethod.useTiltedWorkplane) {
      defineWorkPlane(currentSection, true);
    }
    // G100 tool call macro handles initial positioning and spindle start internally,
    // but writeToolCall still emits G49 via disableLengthCompensation. The G49 needs
    // the spindle at machine reference (G28/G53) first or it fires SM4054 on a Brother
    // controller with Type 1 + check=Yes parameters. We must NOT pre-assert
    // state.retractedZ here, or writeToolCall's internal writeRetract(Z) becomes a no-op
    // and the standalone G49 trips the alarm. Let writeRetract actually run.
    writeToolCall(tool, insertToolCall);
    formatWords(gPlaneModal.format(17), gAbsIncModal.format(90), gFeedModeModal.format(94)); // re-apply modal format
  } else {
    defineWorkPlane(currentSection, true);
    startSpindle(tool, insertToolCall);
  }
  // write parametric feedrate table
  if (typeof initializeParametricFeeds == "function") {
    initializeParametricFeeds(insertToolCall);
  }
  writeBlock(gPlaneModal.format(17), gAbsIncModal.format(90), gFeedModeModal.format(94));

  onCommand(COMMAND_START_CHIP_TRANSPORT);

  forceAny();

  if (!isProbeOperation()) {
    setProbeAngle(); // output probe angle rotations if required
  }

  setCoolant(tool.coolant); // writes the required coolant codes
  // add dwell for through coolant if needed
  var lastCoolant = isFirstSection() ? COOLANT_OFF : getPreviousSection().getTool().coolant;
  if (tool.coolant == COOLANT_FLOOD) {
    if (lastCoolant == COOLANT_FLOOD_THROUGH_TOOL || lastCoolant == COOLANT_FLOOD) {
      onDwell(0.1);
    } else {
      onDwell(0.6);
    }
  }

  setSmoothing(smoothing.isAllowed);

  if (getProperty("washdownCoolant") == "always") {
    writeBlock(washdownModal.format(tool.type == TOOL_PROBE ? washdownCoolant.off : washdownCoolant.on));
  }

  if (isProbeOperation()) {
    // validate(probeVariables.probeAngleMethod != "G68", "You cannot probe while G68 Rotation is in effect.");
    validate(probeVariables.probeAngleMethod != "G54.4", "You cannot probe while workpiece setting error compensation G54.4 is enabled.");
    if (! settings.probing.probeOn) {
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(settings.probing.macroCall, "P" + 8832); // spin the probe on
      } else {
        writeBlock(settings.probing.macroCall, "P" + 8703, "A0", "M1", "X" + 0); // Zero move to turn on probe
      }
      settings.probing.probeOn = true;
    }
    inspectionCreateResultsFileHeader();
  }

  // OWG v3_7: refuse In control / Inverse wear comp; guard Wear comp registers before cutting
  writeCutterCompGuards();

  // prepositioning
  var initialPosition = getFramePosition(currentSection.getInitialPosition());
  // OWG v3_7: G100 handles initial positioning, EXCEPT when a tool measurement ran after it
  if (!insertToolCall || repositionAfterToolCheck) {
    repositionAfterToolCheck = false;
    var isRequired = state.retractedZ || !state.lengthCompensationActive || (!isFirstSection() && getPreviousSection().isMultiAxis());
    if (currentSection.isMultiAxis() || (currentSection.isOptimizedForMachine() && isTCPSupportedByOperation(currentSection))) {
      onCommand(COMMAND_LOAD_TOOL);
      forceAny();
    } else {
      writeInitialPositioning(initialPosition, isRequired);
    }
  }

  // output the Machining Load Monitor code
  setMachineLoadMonitor(true, insertToolCall);

  if (typeof inspectionProcessSectionStart == "function") {
    inspectionProcessSectionStart();
  }
}

function setMachineLoadMonitor(enable, insertToolCall) {
  if (getProperty("useMachiningLoadMonitor") == "-1") {
    return;
  }
  var loadMonitorCode;
  if (enable && tool.type != TOOL_PROBE) { // enable machine load monitoring
    if (insertToolCall || forceSpindleSpeed || isSpindleSpeedDifferent()) {
      machineLoadMonitorOutput.reset();
    }
    loadMonitorCode = machineLoadMonitorOutput.format(parseInt(getProperty("useMachiningLoadMonitor"), 10));
  } else { // disable machine load monitoring
    loadMonitorCode = machineLoadMonitorOutput.format(340);
  }
  if (loadMonitorCode) {
    writeBlock(loadMonitorCode, formatComment("MACHINING LOAD MONITOR " + (machineLoadMonitorOutput.getCurrent() == 340 ? "OFF" : "ON")));
  }
}

function onDwell(seconds) {
  var maxValue = 99999.999;
  if (seconds > maxValue) {
    warning(subst(localize("Dwelling time of '%1' exceeds the maximum value of '%2' in operation '%3'"), seconds, maxValue, getParameter("operation-comment", "")));
  }
  seconds = clamp(0, seconds, 99999999);
  writeBlock(gFormat.format(4), "P" + secFormat.format(seconds));
}

function onSpindleSpeed(spindleSpeed) {
  writeBlock(sOutput.format(spindleSpeed));
}

function onCycle() {
  writeBlock(gPlaneModal.format(17));
}

function getCommonCycle(x, y, z, r) {
  forceXYZ(); // force xyz on first drill hole of any cycle
  if ((currentSection.getPolarMode && currentSection.getPolarMode() != POLAR_MODE_OFF) && currentSection.isMultiAxis()) {
    var polarPosition = getPolarPosition(x, y, z);
    return [xOutput.format(polarPosition.first.x), yOutput.format(polarPosition.first.y), zOutput.format(polarPosition.first.z),
      aOutput.format(polarPosition.second.x), bOutput.format(polarPosition.second.y), cOutput.format(polarPosition.second.z),
      "R" + xyzFormat.format(r)];
  } else {
    return [xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + xyzFormat.format(r)];
  }
}

/** Convert approach to sign. */
function approach(value) {
  validate((value == "positive") || (value == "negative"), "Invalid approach.");
  return (value == "positive") ? 1 : -1;
}

function protectedProbeMove(cycle, x, y, z) {
  var _x = xOutput.format(x);
  var _y = yOutput.format(y);
  var _z = zOutput.format(z);

  // Retrieve the safe probe feedrate (mm/min) from the property.
  // The Blum probe trips the skip signal if it moves faster than its rated
  // positioning speed while armed - so any protected move must use this feed,
  // never the rapid/highFeedrate (which was the regression causing F20000 retracts).
  var safeProbeFeed = getProperty("safeProbeFeedrate") !== undefined ? getProperty("safeProbeFeedrate") : 5000;
  if (unit == IN) {
    safeProbeFeed = safeProbeFeed / 25.4;
  }

  // Inside a cycle, the cycle's own feedrate is used for the approach;
  // outside a cycle (e.g. between probe ops), fall back to safeProbeFeed
  // - NEVER to highFeedrate, since the probe is still armed.
  var cycleFeedrate = cycle ? cycle.feedrate : safeProbeFeed;

  var _code = getProperty("probingType") == "Renishaw" ? 8810 : 8703;
  var _probeParams = getProperty("probingType") == "Renishaw" ? "" : "A1 M3";

  if (_z && z >= getCurrentPosition().z) {
    // Z UP retract: always use safeProbeFeed (probe is armed).
    writeBlock(gFormat.format(65), "P" + _code, _probeParams, _z, getFeed(safeProbeFeed));
  }
  if (_x || _y) {
    writeBlock(gFormat.format(65), "P" + _code, _probeParams, _x, _y, getFeed(cycleFeedrate));
  }
  if (_z && z < getCurrentPosition().z) {
    writeBlock(gFormat.format(65), "P" + _code, _probeParams, _z, getFeed(cycleFeedrate));
  }
}

function onCyclePoint(x, y, z) {
  if (isInspectionOperation()) {
    if (typeof inspectionCycleInspect == "function") {
      inspectionCycleInspect(cycle, x, y, z);
      return;
    } else {
      cycleNotSupported();
    }
  } else if (isProbeOperation()) {
    writeProbeCycle(cycle, x, y, z);
  } else {
    writeDrillCycle(cycle, x, y, z);
  }
}

function writeDrillCycle(cycle, x, y, z) {
  if (!isSameDirection(machineConfiguration.getSpindleAxis(), getForwardDirection(currentSection))) {
    expandCyclePoint(x, y, z);
    return;
  }

  if (isFirstCyclePoint() || isProbeOperation()) {
    if (!isProbeOperation()) {
      // return to initial Z which is clearance plane and set absolute mode
      repositionToCycleClearance(cycle, x, y, z);
    }

    writeBlock(gFeedModeModal.format(94));
    var F = cycle.feedrate;
    var P = !cycle.dwell ? 0 : cycle.dwell; // in seconds

    // tapping variables
    var tapUnit = unit;
    if (hasParameter("operation:tool_unit")) {
      if (getParameter("operation:tool_unit") == "inches") {
        tapUnit = IN;
      } else {
        tapUnit = MM;
      }
    }
    var threadPitchMM = (unit == IN) ? 25.4 * tool.threadPitch : tool.threadPitch;
    var threadsPerInch = toPreciseUnit(1.0, IN) / tool.threadPitch;

    switch (cycleType) {
    case "drilling":
      writeBlock(
        gRetractModal.format(98), gCycleModal.format(81),
        getCommonCycle(x, y, z, cycle.retract),
        cyclefeedOutput.format(F)
      );
      break;
    case "counter-boring":
      if (P > 0) {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(82),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P),
          cyclefeedOutput.format(F)
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(81),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "chip-breaking":
      if ((cycle.accumulatedDepth < cycle.depth) || (P > 0)) {
        expandCyclePoint(x, y, z);
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(73),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          "Q" + xyzFormat.format(cycle.incrementalDepth),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "deep-drilling":
      if (P > 0) {
        expandCyclePoint(x, y, z);
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(83),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          "Q" + xyzFormat.format(cycle.incrementalDepth),
          // conditional(P > 0, "P" + secFormat.format(P)),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "tapping":
      if (!F) {
        F = tool.getTappingFeedrate();
      }
      if (getProperty("usePitchForTapping")) {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format((tool.type == TOOL_TAP_LEFT_HAND) ? 78 : 77),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          unit == IN ? "J" + xyzFormat.format(threadsPerInch) : "",
          unit == MM ? "I" + xyzFormat.format(threadPitchMM) : "",
          sOutput.format(spindleSpeed),
          getProperty("doubleTapWithdrawSpeed") ? "L" + rpmFormat.format(spindleSpeed * 2 > 6000 ? 6000 : spindleSpeed * 2) : ""
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format((tool.type == TOOL_TAP_LEFT_HAND) ? 74 : 84),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          "P" + secFormat.format(P),
          sOutput.format(spindleSpeed),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "left-tapping":
      if (!F) {
        F = tool.getTappingFeedrate();
      }
      if (getProperty("usePitchForTapping")) {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(78),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          unit == IN ? "J" + xyzFormat.format(threadsPerInch) : "",
          unit == MM ? "I" + xyzFormat.format(threadPitchMM) : "",
          sOutput.format(spindleSpeed),
          getProperty("doubleTapWithdrawSpeed") ? "L" + rpmFormat.format(spindleSpeed * 2 > 6000 ? 6000 : spindleSpeed * 2) : ""
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(74),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P),
          sOutput.format(spindleSpeed),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "right-tapping":
      if (!F) {
        F = tool.getTappingFeedrate();
      }
      if (getProperty("usePitchForTapping")) {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(77),
          getCommonCycle(x, y, cycle.bottom, cycle.retract),
          unit == IN ? "J" + xyzFormat.format(threadsPerInch) : "",
          unit == MM ? "I" + xyzFormat.format(threadPitchMM) : "",
          sOutput.format(spindleSpeed),
          getProperty("doubleTapWithdrawSpeed") ? "L" + rpmFormat.format(spindleSpeed * 2 > 6000 ? 6000 : spindleSpeed * 2) : ""
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(84),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P),
          sOutput.format(spindleSpeed),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "tapping-with-chip-breaking":
    case "left-tapping-with-chip-breaking":
    case "right-tapping-with-chip-breaking":
      if (cycle.accumulatedDepth < cycle.depth) {
        error(localize("Accumulated pecking depth is not supported for tapping cycles with chip breaking."));
      } else {
        if (!F) {
          F = tool.getTappingFeedrate();
        }
        if (getProperty("usePitchForTapping")) {
          writeBlock(
            gRetractModal.format(98), gCycleModal.format((tool.type == TOOL_TAP_LEFT_HAND) ? 78 : 77),
            getCommonCycle(x, y, cycle.bottom, cycle.retract),
            "Q" + xyzFormat.format(cycle.incrementalDepth),
            unit == IN ? "J" + xyzFormat.format(threadsPerInch) : "",
            unit == MM ? "I" + xyzFormat.format(threadPitchMM) : "",
            sOutput.format(spindleSpeed),
            getProperty("doubleTapWithdrawSpeed") ? "L" + rpmFormat.format(spindleSpeed * 2 > 6000 ? 6000 : spindleSpeed * 2) : ""
          );
        } else { // G84/G74 does not support chip breaking
          error(localize("Tapping with chip breaking is not supported by the G74/G84 cycle."));
        }
      }
      break;
    case "fine-boring":
      writeBlock(
        gRetractModal.format(98), gCycleModal.format(76),
        getCommonCycle(x, y, z, cycle.retract),
        "P" + secFormat.format(P), // not optional
        "Q" + xyzFormat.format(cycle.shift),
        feedOutput.format(F)
      );
      break;
    case "back-boring":
      var dx = (gPlaneModal.getCurrent() == 19) ? cycle.backBoreDistance : 0;
      var dy = (gPlaneModal.getCurrent() == 18) ? cycle.backBoreDistance : 0;
      var dz = (gPlaneModal.getCurrent() == 17) ? cycle.backBoreDistance : 0;
      writeBlock(
        gRetractModal.format(98), gCycleModal.format(87),
        getCommonCycle(x, y, cycle.bottom - cycle.backBoreDistance, cycle.bottom),
        "Q" + xyzFormat.format(cycle.shift),
        "P" + secFormat.format(P), // not optional
        cyclefeedOutput.format(F)
      );
      break;
    case "reaming":
      if (feedFormat.getResultingValue(cycle.feedrate) != feedFormat.getResultingValue(cycle.retractFeedrate)) {
        expandCyclePoint(x, y, z);
        break;
      }
      if (P > 0) {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(89),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P),
          cyclefeedOutput.format(F)
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(85),
          getCommonCycle(x, y, z, cycle.retract),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "stop-boring":
      if (P > 0) {
        expandCyclePoint(x, y, z);
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(86),
          getCommonCycle(x, y, z, cycle.retract),
          cyclefeedOutput.format(F)
        );
      }
      break;
    case "manual-boring":
      writeBlock(
        gRetractModal.format(98), gCycleModal.format(88),
        getCommonCycle(x, y, z, cycle.retract),
        "P" + secFormat.format(P), // not optional
        cyclefeedOutput.format(F)
      );
      break;
    case "boring":
      if (feedFormat.getResultingValue(cycle.feedrate) != feedFormat.getResultingValue(cycle.retractFeedrate)) {
        expandCyclePoint(x, y, z);
        break;
      }
      if (P > 0) {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(89),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P), // not optional
          cyclefeedOutput.format(F)
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gCycleModal.format(85),
          getCommonCycle(x, y, z, cycle.retract),
          cyclefeedOutput.format(F)
        );
      }
      break;
    default:
      expandCyclePoint(x, y, z);
    }
  } else {
    if (cycleExpanded) {
      expandCyclePoint(x, y, z);
    } else {
      if (!xyzFormat.areDifferent(x, xOutput.getCurrent()) && !xyzFormat.areDifferent(y, yOutput.getCurrent())) {
        xOutput.reset(); // at least one axis is required
      }
      if ((currentSection.getPolarMode && currentSection.getPolarMode() != POLAR_MODE_OFF) && currentSection.isMultiAxis()) {
        var polarPosition = getPolarPosition(x, y, z);
        setCurrentPositionAndDirection(polarPosition);
        writeBlock(xOutput.format(polarPosition.first.x), yOutput.format(polarPosition.first.y),
          aOutput.format(polarPosition.second.x), bOutput.format(polarPosition.second.y), cOutput.format(polarPosition.second.z));
      } else {
        writeBlock(xOutput.format(x), yOutput.format(y));
      }
    }
  }
}


//Updated writeProbeCycle and getProbingArguments with Rob Lockwoods changes
function writeProbeCycle(cycle, x, y, z) {
  if (!settings.workPlaneMethod.useTiltedWorkplane && !isSameDirection(currentSection.workPlane.forward, new Vector(0, 0, 1))) {
    if (!settings.probing.allowIndexingWCSProbing && currentSection.strategy == "probe") {
      error(localize("Updating WCS / work offset using probing is only supported by the CNC in the WCS frame."));
      return;
    }
  }

  // Pattern / mirror safety: these are not supported by either the Renishaw or Blum
  // implementations below, so error out clearly here rather than emit silently-wrong probe motion.
  var isMirrored = currentSection.getInternalPatternId && currentSection.getInternalPatternId() != currentSection.getPatternId();
  if (isMirrored) {
    error(localize("Mirror pattern is not supported for Probing toolpaths."));
    return;
  }
  if (currentSection.isPatterned && currentSection.isPatterned()) {
    var unsupportedCycleTypes = ["probing-x", "probing-y", "probing-xy-inner-corner", "probing-xy-outer-corner", "probing-x-plane-angle", "probing-y-plane-angle"];
    if (unsupportedCycleTypes.indexOf(cycleType) > -1 && (!Matrix.diff(new Matrix(), currentSection.workPlane).isZero())) {
      error(subst(localize("Rotary type patterns are not supported for the Probing cycle type '%1'."), cycleType));
      return;
    }
  }

  if (printProbeResults()) {
    writeProbingToolpathInformation(z - cycle.depth + tool.diameter / 2);
    inspectionWriteCADTransform();
    inspectionWriteWorkplaneTransform();
    if (typeof inspectionWriteVariables == "function") {
      inspectionVariables.pointNumber += 1;
    }
  }
  protectedProbeMove(cycle, x, y, z);
  switch (cycleType) {
    case "probing-x":
      var edgeCoord = x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8811, "X" + xyzFormat.format(x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2)), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(edgeCoord), "X" + xyzFormat.format(edgeCoord), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-y":
      var edgeCoord = y + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8811, "Y" + xyzFormat.format(y + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2)), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(edgeCoord), "Y" + xyzFormat.format(edgeCoord), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-z":
      protectedProbeMove(cycle, x, y, Math.min(z - cycle.depth + cycle.probeClearance, cycle.retract));
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8811, "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "K" + xyzFormat.format(z - cycle.depth), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-x-wall":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "X" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "S" + xyzFormat.format(cycle.width1), "X1", "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-y-wall":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "Y" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), "Y1", "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-x-channel":
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "X" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "S" + xyzFormat.format(cycle.width1), "X1", "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-x-channel-with-island":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "X" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "R" + xyzFormat.format(-cycle.probeClearance), "S" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), "X1", "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-y-channel":
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "Y" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width1), "Y1", "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-y-channel-with-island":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "Y" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(y), "R" + xyzFormat.format(-cycle.probeClearance), "S" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), "Y1", "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-circular-boss":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8814, "D" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        // Upstream commit 213dc15: Blum circular boss Z height offset for probe stylus radius
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter / 2)), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-circular-partial-boss":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8823, "A" + xyzFormat.format(cycle.partialCircleAngleA), "B" + xyzFormat.format(cycle.partialCircleAngleB), "C" + xyzFormat.format(cycle.partialCircleAngleC), "D" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        // Upstream commit 213dc15: Blum partial circular boss Z height offset for probe stylus radius
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "H" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleA)), "U" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleB)), "V" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleC)), "I" + xyzFormat.format(x), "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width1), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter / 2)), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-circular-hole":
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8814, "D" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-circular-partial-hole":
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8823, "A" + xyzFormat.format(cycle.partialCircleAngleA), "B" + xyzFormat.format(cycle.partialCircleAngleB), "C" + xyzFormat.format(cycle.partialCircleAngleC), "D" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "H" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleA)), "U" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleB)), "V" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleC)), "I" + xyzFormat.format(x), "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-circular-hole-with-island":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8814, "Z" + xyzFormat.format(z - cycle.depth), "D" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "J" + xyzFormat.format(y), "R" + xyzFormat.format(-cycle.probeClearance), "S" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-circular-partial-hole-with-island":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8823, "Z" + xyzFormat.format(z - cycle.depth), "A" + xyzFormat.format(cycle.partialCircleAngleA), "B" + xyzFormat.format(cycle.partialCircleAngleB), "C" + xyzFormat.format(cycle.partialCircleAngleC), "D" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "H" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleA)), "U" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleB)), "V" + xyzFormat.format(ensurePositiveAngle(cycle.partialCircleAngleC)), "I" + xyzFormat.format(x), "J" + xyzFormat.format(y), "R" + xyzFormat.format(-cycle.probeClearance), "S" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-rectangular-hole":
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "X" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
        writeBlock(gFormat.format(65), "P" + 8812, "Y" + xyzFormat.format(cycle.width2), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        zOutput.reset();
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "S" + xyzFormat.format(cycle.width1), "X1", "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
        zOutput.reset();
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width2), "Y1", "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-rectangular-boss":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "Z" + xyzFormat.format(z - cycle.depth), "X" + xyzFormat.format(cycle.width1), "R" + xyzFormat.format(cycle.probeClearance), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeBlock(gFormat.format(65), "P" + 8812, "Z" + xyzFormat.format(z - cycle.depth), "Y" + xyzFormat.format(cycle.width2), "R" + xyzFormat.format(cycle.probeClearance), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        zOutput.reset();
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "S" + xyzFormat.format(cycle.width1), "X1", "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
        zOutput.reset();
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width2), "Y1", "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-rectangular-hole-with-island":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8812, "Z" + xyzFormat.format(z - cycle.depth), "X" + xyzFormat.format(cycle.width1), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
        writeBlock(gFormat.format(65), "P" + 8812, "Z" + xyzFormat.format(z - cycle.depth), "Y" + xyzFormat.format(cycle.width2), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
      } else {
        zOutput.reset();
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x), "S" + xyzFormat.format(cycle.width1), "X1", "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
        zOutput.reset();
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(y), "S" + xyzFormat.format(cycle.width2), "Y1", "Z" + xyzFormat.format(z - cycle.depth + (tool.diameter /2)), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(-cycle.probeClearance), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-inner-corner":
      var cornerX = x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
      var cornerY = y + approach(cycle.approach2) * (cycle.probeClearance + tool.diameter / 2);
      var cornerI = 0; var cornerJ = 0;
      if (cycle.probeSpacing !== undefined) { cornerI = cycle.probeSpacing; cornerJ = cycle.probeSpacing; }
      if (getProperty("probingType") == "Renishaw") {
        if ((cornerI != 0) && (cornerJ != 0)) {
          if (currentSection.strategy == "probe") { setProbeAngleMethod(); }
        }
        protectedProbeMove(cycle, x, y, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8815, xOutput.format(cornerX), yOutput.format(cornerY), conditional(cornerI != 0, "I" + xyzFormat.format(cornerI)), conditional(cornerJ != 0, "J" + xyzFormat.format(cornerJ)), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        if ((cornerI != 0) && (cornerJ != 0)) {
          error("Angled inner corner probing not implemented");
          if (currentSection.strategy == "probe") { setProbeAngleMethod(); }
        }
        protectedProbeMove(cycle, x, y, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(cornerX), "X" + xyzFormat.format(cornerX), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "J" + xyzFormat.format(cornerY), "Y" + xyzFormat.format(cornerY), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-xy-outer-corner":
      var cornerX = approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
      var cornerY = approach(cycle.approach2) * (cycle.probeClearance + tool.diameter / 2);
      var cornerI = 0; var cornerJ = 0;
      if (cycle.probeSpacing !== undefined) { cornerI = cycle.probeSpacing; cornerJ = cycle.probeSpacing; }
      if (getProperty("probingType") == "Renishaw") {
        if ((cornerI != 0) && (cornerJ != 0)) {
          if (currentSection.strategy == "probe") { setProbeAngleMethod(); }
        }
        protectedProbeMove(cycle, x, y, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8816, xOutput.format(x + cornerX), yOutput.format(y + cornerY), conditional(cornerI != 0, "I" + xyzFormat.format(cornerI)), conditional(cornerJ != 0, "J" + xyzFormat.format(cornerJ)), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
      } else {
        if ((cornerI != 0) && (cornerJ != 0)) {
          error("Angled outer corner probing not implemented");
          if (currentSection.strategy == "probe") { setProbeAngleMethod(); }
        }
        protectedProbeMove(cycle, x, y, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "I" + xyzFormat.format(x + cornerX), "J" + xyzFormat.format(y + cornerY), "X" + xyzFormat.format(x + (2 * cornerX)), "Y" + xyzFormat.format(y + (2 * cornerY)), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, true));
        writeExtraBlumProbing(cycle);
      }
      break;
    case "probing-x-plane-angle":
      var edgeCoord = x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8843, "X" + xyzFormat.format(x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2)), "D" + xyzFormat.format(cycle.probeSpacing), "Q" + xyzFormat.format(cycle.probeOvertravel), "A" + xyzFormat.format(cycle.nominalAngle != undefined ? cycle.nominalAngle : 90), getProbingArguments(cycle, false));
      } else {
        var nominalAngle = (cycle.nominalAngle > 90 ? 90.0-cycle.nominalAngle : -(360.0 + cycle.nominalAngle - 90.0));
        protectedProbeMove(cycle, x, y - 0.5 * cycle.probeSpacing, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "X" + xyzFormat.format(edgeCoord), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, false));
        protectedProbeMove(cycle, x, y + 0.5 * cycle.probeSpacing, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "D" + xyzFormat.format(nominalAngle), "X" + xyzFormat.format(edgeCoord), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, false));
        protectedProbeMove(cycle, x, y, z - cycle.depth);
        writeExtraBlumProbing(cycle);
      }
      if (currentSection.strategy == "probe") {
        setProbeAngleMethod();
        probeVariables.compensationXY = "X" + xyzFormat.format(0) + " Y" + xyzFormat.format(0);
      }
      break;
    case "probing-y-plane-angle":
      var edgeCoord = y + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
      protectedProbeMove(cycle, x, y, z - cycle.depth);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8843, "Y" + xyzFormat.format(y + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2)), "D" + xyzFormat.format(cycle.probeSpacing), "Q" + xyzFormat.format(cycle.probeOvertravel), "A" + xyzFormat.format(cycle.nominalAngle != undefined ? cycle.nominalAngle : 0), getProbingArguments(cycle, false));
      } else {
        var nominalAngle = (cycle.nominalAngle > 0 ? -cycle.nominalAngle : -(360.0 + cycle.nominalAngle));
        protectedProbeMove(cycle, x - 0.5 * cycle.probeSpacing, y, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "Y" + xyzFormat.format(edgeCoord), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, false));
        protectedProbeMove(cycle, x + 0.5 * cycle.probeSpacing, y, z - cycle.depth);
        writeBlock(gFormat.format(65), "P" + 8700, "A1", "M3", "D" + xyzFormat.format(nominalAngle), "Y" + xyzFormat.format(edgeCoord), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, false));
        protectedProbeMove(cycle, x, y, z - cycle.depth);
        writeExtraBlumProbing(cycle);
      }
      if (currentSection.strategy == "probe") {
        setProbeAngleMethod();
        probeVariables.compensationXY = "X" + xyzFormat.format(0) + " Y" + xyzFormat.format(0);
      }
      break;
    case "probing-xy-pcd-hole":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8819, "A" + xyzFormat.format(cycle.pcdStartingAngle), "B" + xyzFormat.format(cycle.numberOfSubfeatures), "C" + xyzFormat.format(cycle.widthPCD), "D" + xyzFormat.format(cycle.widthFeature), "K" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), getProbingArguments(cycle, false));
        if (cycle.updateToolWear) { error(localize("Action -Update Tool Wear- is not supported with this cycle.")); return; }
      } else { error(localize("XY PCD hole probing is not supported.")); }
      break;
    case "probing-xy-pcd-boss":
      protectedProbeMove(cycle, x, y, z);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(gFormat.format(65), "P" + 8819, "A" + xyzFormat.format(cycle.pcdStartingAngle), "B" + xyzFormat.format(cycle.numberOfSubfeatures), "C" + xyzFormat.format(cycle.widthPCD), "D" + xyzFormat.format(cycle.widthFeature), "Z" + xyzFormat.format(z - cycle.depth), "Q" + xyzFormat.format(cycle.probeOvertravel), "R" + xyzFormat.format(cycle.probeClearance), getProbingArguments(cycle, false));
        if (cycle.updateToolWear) { error(localize("Action -Update Tool Wear- is not supported with this cycle.")); return; }
      } else { error(localize("XY PCD boss probing is not supported.")); }
      break;
  }
}

function writeExtraBlumProbing(cycle) {
  var toleranceArgs = [ ];
  if (cycle.wrongSizeAction && cycle.wrongSizeAction == "stop-message" && cycle.toleranceSize) {
    toleranceArgs.push(["T" + xyzFormat.format(cycle.toleranceSize), "U" + xyzFormat.format(-cycle.toleranceSize)]);
  }
  if (cycle.outOfPositionAction && cycle.outOfPositionAction == "stop-message" && cycle.tolerancePosition) {
    toleranceArgs.push(["I" + xyzFormat.format(cycle.tolerancePosition), "J" + xyzFormat.format(-cycle.tolerancePosition)]);
  }
  if (toleranceArgs.length > 0) {
    writeBlock(gFormat.format(65), "P" + 8707, toleranceArgs);
  }
  if (cycle.updateToolWear) {
    var wearArgs = [
      conditional(cycle.toolWearErrorCorrection < 100, "K" + xyzFormat.format(cycle.toolWearErrorCorrection)),
      "E" + ((cycleType == "probing-z") ? xyzFormat.format(cycle.toolLengthOffset) : xyzFormat.format(cycle.toolDiameterOffset)),
      conditional(cycle.updateToolWear, "I" + xyzFormat.format(cycle.toolWearUpdateThreshold))
    ];
    writeBlock(gFormat.format(65), "P" + 8706, wearArgs);
  }
}

//Updated writeProbeCycle and getProbingArguments with Rob Lockwoods changes
function getProbingArguments(cycle, updateWCS) {
  var outputWCSCode = updateWCS && currentSection.strategy == "probe";
  var probeOutputWorkOffset = currentSection.probeWorkOffset;
  if (outputWCSCode) {
    validate(probeOutputWorkOffset > 0 && probeOutputWorkOffset <= 306+(6*8), "Work offset is out of range.");
    var nextWorkOffset = hasNextSection() ? getNextSection().workOffset == 0 ? 1 : getNextSection().workOffset : -1;
    if (probeOutputWorkOffset == nextWorkOffset) { currentWorkOffset = undefined; }
  }
  if (getProperty("probingType") == "Renishaw") {
    return [
      (cycle.angleAskewAction == "stop-message" ? "B" + xyzFormat.format(cycle.toleranceAngle ? cycle.toleranceAngle : 0) : undefined),
      ((cycle.updateToolWear && cycle.toolWearErrorCorrection < 100) ? "F" + xyzFormat.format(cycle.toolWearErrorCorrection ? cycle.toolWearErrorCorrection / 100 : 100) : undefined),
      (cycle.wrongSizeAction == "stop-message" ? "H" + xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : undefined),
      ((cycle.outOfPositionAction && cycle.outOfPositionAction == "stop-message") ? "M" + xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : undefined),
      ((cycle.updateToolWear && cycleType == "probing-z") ? "T" + xyzFormat.format(cycle.toolLengthOffset) : undefined),
      ((cycle.updateToolWear && cycleType !== "probing-z") ? "T" + xyzFormat.format(cycle.toolDiameterOffset) : undefined),
      (cycle.updateToolWear ? "V" + xyzFormat.format(cycle.toolWearUpdateThreshold ? cycle.toolWearUpdateThreshold : 0) : undefined),
      (cycle.printResults ? "W" + xyzFormat.format(1 + cycle.incrementComponent) : undefined), 
      conditional(outputWCSCode, "S" + probeWCSFormat.format(probeOutputWorkOffset > 6 ? (probeOutputWorkOffset - 6 + 100) : probeOutputWorkOffset))
    ];
  } else {
    var isThreePoint = (cycleType == "probing-xy-circular-partial-boss" || cycleType == "probing-xy-circular-partial-hole" || cycleType == "probing-xy-circular-partial-hole-with-island");
    // V-1. tells the Blum macro to print its native (human-readable) result file.
    // Only emit it when the user wants raw Blum output - in 'fusion' mode the DPRNT
    // spoof in onCycleEnd produces the Renishaw-format lines instead, and the native
    // Blum print would duplicate / conflict with that file.
    var outputBlumPrint = (cycle.printResults && !isThreePoint && getProperty("probeResultsFormat") == "raw") ? "V-1." : undefined;
    return [
      conditional(outputWCSCode, "W" + probeWCSFormat.format(decodeProbeWCSBlum(probeOutputWorkOffset))),
      outputBlumPrint
    ];
  }
}

// Probe maintains its own WCS which is a bit odd
// 0 = G54
// 1-6 = G54-59
// 7-306 = 1-48 = G54.1 P1-300
// 307-314 = G54 G54.2 P1-8
// 315-327 = G55 G54.2 P1-8 ... etc
function decodeProbeWCSBlum(probeOutputWorkOffset) {
  if (probeOutputWorkOffset >= 0) {
    if (probeOutputWorkOffset == 0) {
      return 54;
    } else if (probeOutputWorkOffset <= 6) {
      return probeOutputWorkOffset + 53;
    } else if (probeOutputWorkOffset <= 306) {
      return -1 * (probeOutputWorkOffset - 6);
    } else {
      return ((probeOutputWorkOffset - 307) % 8) +1;
    }
  }
  error(localize("Unknown probeOutputWorkOffset value:" + probeOutputWorkOffset));
  return 0;
}

// =============================================================================
// OWG v3_4: TOOL MEASUREMENT, WEAR CHECK, AND MODAL PRESERVATION SYSTEM
// =============================================================================

/**
 * Checks if a tool number is specified in a comma-separated list or 'all'.
 * Supports individual numbers ("1, 3, 5"), ranges ("1-4"), and wildcards ("all", "*").
 * 
 * @param {string} listString Comma-separated string of tool numbers
 * @param {number} toolNumber The tool number to test
 * @return {boolean} True if the tool is in the list
 */
function isToolInList(listString, toolNumber) {
  if (!listString) {
    return false;
  }
  var trimmed = String(listString).trim().toLowerCase();
  if (trimmed === "" || trimmed === "none" || trimmed === "false") {
    return false;
  }
  if (trimmed === "all" || trimmed === "*") {
    return true;
  }
  var parts = trimmed.split(",");
  for (var i = 0; i < parts.length; ++i) {
    var item = parts[i].trim();
    if (item === "") {
      continue;
    }
    var dashIndex = item.indexOf("-");
    if (dashIndex !== -1) {
      var low = parseInt(item.substring(0, dashIndex).trim().replace(/^t/i, ""), 10);
      var high = parseInt(item.substring(dashIndex + 1).trim().replace(/^t/i, ""), 10);
      if (!isNaN(low) && !isNaN(high) && toolNumber >= low && toolNumber <= high) {
        return true;
      }
    } else {
      var num = parseInt(item.replace(/^t/i, ""), 10);
      if (!isNaN(num) && num === toolNumber) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determines if a tool is centric (drill, tap, reamer, center drill, etc.)
 * Centric tools are measured on center (X=0) via O8602, while milling tools
 * use radial offset via O8603.
 * 
 * @param {Tool} tool
 * @return {boolean}
 */
function isCentricTool(tool) {
  // OWG v3_7: explicit type list. The v3_6 substring match on getToolTypeName()
  // classified "tapered mill" as centric because it contains "tap".
  var keys = ["drill", "drillBlock", "drillSpot", "drillCtr", "reamer", "tapRH", "tapLH", "cbore", "csink"];
  for (var i = 0; i < keys.length; ++i) {
    if (isToolType(tool, keys[i])) {
      return true;
    }
  }
  return false;
}

/**
 * OWG v3_7: How the Laser NT may measure LENGTH on this tool.
 * - "offset": flat-bottomed tools whose lowest point is at the measuring radius
 *             (flat, bullnose, face, slot, dovetail) - O8603 with X > 0.
 * - "ball":   ball / lollipop - O8603 with X = 0 (apex).
 * - "centric": everything else (drills, taps, reamers, chamfer, thread, form,
 *             corner-rounding, tapered, boring bars, engravers, unknown) - measured
 *             on centre with O8602. An off-centre laser length on a pointed or
 *             profiled tool is SHORTER than the real tool, which makes it plunge
 *             deeper than programmed. On-centre is either correct or reads long
 *             (tool cuts shallow), never short.
 */
function getLaserLengthMethod(tool) {
  if (isCentricTool(tool)) {
    return "centric";
  }
  if (isToolType(tool, "ball") || isToolType(tool, "lollipop")) {
    return "ball";
  }
  if (isToolType(tool, "flat") || isToolType(tool, "bullnose") || isToolType(tool, "face") ||
      isToolType(tool, "slot") || isToolType(tool, "dovetail")) {
    return "offset";
  }
  return "centric";
}

/** OWG v3_7: Tool types the O6009 wear/runout check measures at a meaningful diameter. */
function isLaserWearSupportedType(tool) {
  var keys = ["flat", "bullnose", "ball", "lollipop", "face", "slot", "dovetail", "drill", "drillBlock", "reamer"];
  for (var i = 0; i < keys.length; ++i) {
    if (isToolType(tool, keys[i])) {
      return true;
    }
  }
  return false;
}

/** OWG v3_7: Tool can go through the Laser NT at all (length compare / wear). */
function isLaserCapableTool(tool) {
  return (tool.type != TOOL_PROBE) && (tool.diameter <= toPreciseUnit(24.0, MM)) && (unit == MM);
}

/** OWG v3_7: true if the tool comment contains any of the given tags. */
function toolHasTag(tool, tags) {
  var comment = tool.comment ? String(tool.comment).toUpperCase() : "";
  for (var i = 0; i < tags.length; ++i) {
    if (comment.indexOf(tags[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/** OWG v3_7: tool is on the Never-measure list or tagged [NO MEASURE]. */
function isToolExcluded(tool) {
  return isToolInList(getProperty("excludeTools"), tool.number) || toolHasTag(tool, ["[NO MEASURE]"]);
}

/**
 * OWG v3_7: Resolves how (and whether) a tool's LENGTH is measured.
 * Priority: Never-measure > Z-Nano list/[ZNANO LEN] > Laser list/[LASER LEN] > Length method.
 * A tool the laser cannot handle (> 24 mm or inch program) always falls back to the Z-Nano.
 *
 * @return {object} {setter:"znano"|"laser"|"none", compare:boolean, why:string}
 */
function getLengthPlan(tool) {
  if (tool.type == TOOL_PROBE) {
    return {setter:"none", compare:false, why:"PROBE"};
  }
  if (isToolExcluded(tool)) {
    return {setter:"none", compare:false, why:"NEVER MEASURE"};
  }
  var inZnano = isToolInList(getProperty("lengthZnanoTools"), tool.number) || toolHasTag(tool, ["[ZNANO LEN]", "[TOUCH LEN]"]);
  var inLaser = isToolInList(getProperty("lengthLaserTools"), tool.number) || toolHasTag(tool, ["[LASER LEN]"]);
  if (inZnano && inLaser) {
    error(localize("OWG: Tool " + tool.number + " is in both the Z-Nano and the Laser tool lists/tags. Pick one."));
    return {setter:"none", compare:false, why:"CONFLICT"};
  }
  if (inZnano) {
    return {setter:"znano", compare:false, why:"Z-NANO LIST"};
  }
  var method = getProperty("lengthMethod");
  if (inLaser || method == "laser") {
    if (isLaserCapableTool(tool)) {
      return {setter:"laser", compare:false, why:inLaser ? "LASER LIST" : "METHOD"};
    }
    return {setter:"znano", compare:false, why:(unit != MM) ? "LASER N/A INCH" : "LASER N/A OVER 24MM"};
  }
  var compare = (method == "znanoCompare") && isLaserCapableTool(tool);
  return {setter:"znano", compare:compare, why:(method == "znanoCompare" && !compare) ? "NO COMPARE OVER 24MM" : "METHOD"};
}

/**
 * OWG v3_7: Resolves whether a laser wear check (O6009) runs for a tool that was requested.
 * @return {object} {check:boolean, why:string}
 */
function getWearPlan(tool, requested) {
  if (tool.type == TOOL_PROBE) {
    return {check:false, why:"PROBE"};
  }
  if (isToolExcluded(tool)) {
    return {check:false, why:"NEVER MEASURE"};
  }
  if (!requested) {
    return {check:false, why:"NOT SELECTED"};
  }
  if (!isLaserCapableTool(tool)) {
    return {check:false, why:(unit != MM) ? "LASER N/A INCH" : "LASER N/A OVER 24MM"};
  }
  if (!isLaserWearSupportedType(tool)) {
    return {check:false, why:"TYPE N/A"};
  }
  return {check:true, why:""};
}

/**
 * Setter for BREAK detection.
 * - [ZNANO BREAK] / [TOUCH BREAK] -> Z-Nano; > 24 mm -> Z-Nano; [LASER BREAK] -> laser
 * - otherwise the same setter the tool uses for length (see getLengthPlan)
 * Break detection itself is enabled per tool in Fusion (Break control).
 *
 * @return {string} "laserNT" or "touch"
 */
function getToolSetterType(tool, purpose) {
  if (isToolExcluded(tool)) {
    error(localize("OWG: Tool " + tool.number + " is on the Never-measure list but has Break control enabled in Fusion. Turn one of them off."));
    return "touch";
  }
  if (toolHasTag(tool, ["[ZNANO BREAK]", "[TOUCH BREAK]"]) || !isLaserCapableTool(tool)) {
    return "touch";
  }
  if (toolHasTag(tool, ["[LASER BREAK]"])) {
    return "laserNT";
  }
  return (getLengthPlan(tool).setter == "laser") ? "laserNT" : "touch";
}

/**
 * OWG v3_5: Sanitizes strings destined for DPRNT blocks per Brother C00 NC Programming Manual
 * Section 6.6.2 Section 1 & Note 2 (Page 265). Whitelist allowed characters: A-Z, 0-9, ()=/.+,-?*
 * Converts all other characters (including #, [, ], :, _) to spaces/asterisks to prevent Macro Command Error.
 * 
 * @param {*} val Value to sanitize
 * @returns {string} Sanitized uppercase string
 */
// OWG v3_5 sanitizeDPRNT regex commented out for v3_6 (docstring noted () and * allowed per Brother manual)
/*
function sanitizeDPRNT(val) {
  if (val == undefined || val == null) {
    return "";
  }
  return String(val).toUpperCase().replace(/[^A-Z0-9 =/\+\-,\?\.]/g, "*");
}
*/
// OWG v3_6: Whitelist allowed characters: A-Z, 0-9, ()=/.+,-?* per Brother C00 Manual Section 6.6.2 Note 2
function sanitizeDPRNT(val) {
  if (val == undefined || val == null) {
    return "";
  }
  return String(val).toUpperCase().replace(/[^A-Z0-9 =/\+\-,\?\.\(\)\*]/g, "*");
}

/**
 * Emits macro assignment #[13000 + tool] = 0.0000 to guarantee that
 * wear compensation geometry register is cleared after any tool measurement
 * or at tool changes, preventing unwanted offset accumulation.
 * 
 * @param {number} [toolNum] Optional tool number; defaults to active tool.number
 */
function ensureWearModeZeroComp(toolNum) {
  var tNum = (toolNum != undefined) ? toolNum : tool.number;
  writeBlock("#[" + (13000 + tNum) + "] = 0.0000", formatComment("ENSURE WEAR MODE ZERO COMP"));
}

// ---------------------------------------------------------------------------
// OWG v3_7 SAFETY HELPERS
// ---------------------------------------------------------------------------

// Persistent macro variable (#500-#999 survive power off, C00 manual 6.2.4) used by
// O6008/O6009 Rev C as a "laser measurement in progress" flag. Holds the tool number
// while the nominal diameter is injected into #[13000+T]; 0 when idle.
// #580-#582 were verified unused by the Blum laser, Z-Nano, touch probe and
// KinematicsPerfect macros in the Sept-25-2026 controller backup.
var LASER_FLAG_VAR = 580;

// Set when a tool measurement runs inside the G100 tool change (COMMAND_TOOL_MEASURE);
// onSection then performs the full approach move that G100 would otherwise provide.
var repositionAfterToolCheck = false;

// Blum laser configuration limits (must match O8671 #110 / #111 on the machine)
var LASER_MIN_TOOL_LENGTH = 50.0;  // O8671 #111
var LASER_MAX_TOOL_LENGTH = 200.0; // O8671 #110

// Tool type constants resolved once. -1 when the constant is not defined by this
// Fusion post kernel, so comparisons simply fail instead of throwing.
var OWG_TYPES = {
  flat      : (typeof TOOL_MILLING_END_FLAT != "undefined") ? TOOL_MILLING_END_FLAT : -1,
  ball      : (typeof TOOL_MILLING_END_BALL != "undefined") ? TOOL_MILLING_END_BALL : -1,
  bullnose  : (typeof TOOL_MILLING_END_BULLNOSE != "undefined") ? TOOL_MILLING_END_BULLNOSE : -1,
  lollipop  : (typeof TOOL_MILLING_LOLLIPOP != "undefined") ? TOOL_MILLING_LOLLIPOP : -1,
  face      : (typeof TOOL_MILLING_FACE != "undefined") ? TOOL_MILLING_FACE : -1,
  slot      : (typeof TOOL_MILLING_SLOT != "undefined") ? TOOL_MILLING_SLOT : -1,
  dovetail  : (typeof TOOL_MILLING_DOVETAIL != "undefined") ? TOOL_MILLING_DOVETAIL : -1,
  drill     : (typeof TOOL_DRILL != "undefined") ? TOOL_DRILL : -1,
  drillBlock: (typeof TOOL_DRILL_BLOCK != "undefined") ? TOOL_DRILL_BLOCK : -1,
  drillSpot : (typeof TOOL_DRILL_SPOT != "undefined") ? TOOL_DRILL_SPOT : -1,
  drillCtr  : (typeof TOOL_DRILL_CENTER != "undefined") ? TOOL_DRILL_CENTER : -1,
  reamer    : (typeof TOOL_REAMER != "undefined") ? TOOL_REAMER : -1,
  tapRH     : (typeof TOOL_TAP_RIGHT_HAND != "undefined") ? TOOL_TAP_RIGHT_HAND : -1,
  tapLH     : (typeof TOOL_TAP_LEFT_HAND != "undefined") ? TOOL_TAP_LEFT_HAND : -1,
  cbore     : (typeof TOOL_COUNTER_BORE != "undefined") ? TOOL_COUNTER_BORE : -1,
  csink     : (typeof TOOL_COUNTER_SINK != "undefined") ? TOOL_COUNTER_SINK : -1
};

function isToolType(t, key) {
  return (OWG_TYPES[key] !== -1) && (t.type == OWG_TYPES[key]);
}

/** Formats a number for a macro argument/expression, always with a decimal point. */
function macroNum(value) {
  var s = xyzFormat.format(value);
  return (s.indexOf(".") == -1) ? s + "." : s;
}

// GOTO labels for post-generated guard code. The C00 GOTO searches forward from the
// current block first, so these only need to be unique relative to each other.
var guardLabel = 90000;
function nextGuardLabel() {
  guardLabel += 1;
  return guardLabel;
}

/** Writes a block without an automatic N number (for IF/GOTO guard labels). */
function writeRawBlock(text) {
  if (optionalSection || skipBlocks) {
    writeWords2("/", text);
  } else {
    writeWords(text);
  }
}

/** Blum laser cycles must run in the machine measuring system (Blum error E18). */
function requireMetricForLaser(what) {
  if (unit != MM) {
    error(localize("OWG: " + what + " uses Blum Laser NT cycles which must run in metric (Blum error E18). Post this program in mm, or remove the laser feature."));
    return false;
  }
  return true;
}

/**
 * Blum laser and Z-Nano cycles overwrite common variables #100-#191. When the
 * probe angle method is G68 the active rotation was commanded from #100/#101/#143,
 * so it cannot be restored after a tool check - refuse instead of guessing.
 */
function validateToolCheckAllowed() {
  if (probeVariables.probeAngleMethod == "G68" &&
      typeof gRotationModal != "undefined" && gRotationModal.getCurrent() == 68 &&
      !getSetting("workPlaneMethod.useTiltedWorkplane", false)) {
    error(localize("OWG: In-cycle tool measurement is not allowed while a G68 probe rotation is active. The Blum cycle overwrites #100/#101/#143 used by the rotation. Move the tool check before the probing operation or after a tool change."));
  }
}

/**
 * OWG v3_7: Program start guards (always executed, never block-skipped):
 * 1. Machine unit check. The C00 has no G20/G21 - units come from the user parameter
 *    <Machine unit system>, readable through #4006 (20 = inch, 21 = metric).
 * 2. Interrupted laser measurement check. O6008/O6009 set #580 = T while a nominal
 *    diameter is in #[13000+T]. If a Blum alarm or reset interrupted them, the
 *    geometry is cleared here and alarm 9122 tells the operator to check that tool.
 * 3. Cutter compensation geometry is zeroed for every tool/D number in the program.
 */
function writeProgramStartGuards() {
  var saveOptional = optionalSection;
  optionalSection = false;
  writeln("");
  writeComment("OWG SAFETY GUARDS");

  var unitOk = nextGuardLabel();
  writeRawBlock("IF [#4006 EQ " + ((unit == MM) ? 21 : 20) + "] GOTO " + unitOk);
  writeRawBlock("#3000=120(" + ((unit == MM) ? "MACHINE NOT IN MM" : "MACHINE NOT IN INCH") + ")");
  writeRawBlock("N" + unitOk);

  var aborted = nextGuardLabel();
  var flagOk = nextGuardLabel();
  writeRawBlock("IF [#" + LASER_FLAG_VAR + " GT 0] GOTO " + aborted);
  writeRawBlock("GOTO " + flagOk);
  writeRawBlock("N" + aborted);
  writeRawBlock("#[13000+#" + LASER_FLAG_VAR + "]=0.");
  writeRawBlock("#" + LASER_FLAG_VAR + "=0.");
  writeRawBlock("#3000=122(LASER MEAS ABORTED)");
  writeRawBlock("N" + flagOk);

  var rows = {};
  var tools = getToolTable();
  for (var i = 0; i < tools.getNumberOfTools(); ++i) {
    var t = tools.getTool(i);
    if (t.type == TOOL_PROBE) {
      continue;
    }
    if (t.number > 0 && t.number <= 99) {
      rows[t.number] = true;
    }
    if (t.diameterOffset > 0 && t.diameterOffset <= 99) {
      rows[t.diameterOffset] = true;
    }
  }
  for (var r in rows) {
    writeRawBlock("#" + (13000 + parseInt(r, 10)) + "=0.");
  }
  writeln("");
  optionalSection = saveOptional;
}

/**
 * OWG v3_7: Cutter compensation guards, called at the start of every section.
 * - "In control" is refused: cutter comp geometry is always 0 on this machine, so
 *   the tool centre would run on the part line (gouge by the full radius).
 * - "Inverse wear" is refused: Blum writes wear with the Fanuc sign convention
 *   (smaller tool = negative), which inverse wear would apply the wrong way.
 * - "Wear": geometry #[13000+D] is zeroed and the wear register #[12000+D] is checked
 *   against maxDiameterWear before any motion. Blum writes wear even when it then
 *   alarms (O8603 N9991), so a bad reading must never reach a finishing pass.
 */
function writeCutterCompGuards() {
  if (tool.type == TOOL_PROBE || !hasParameter("operation:compensationType")) {
    return;
  }
  var compType = String(getParameter("operation:compensationType"));
  if (compType == "control") {
    error(localize("OWG: Operation '" + getParameter("operation-comment", "") + "' uses 'In control' compensation. Cutter comp geometry is always 0 on this machine - use 'Wear' or 'In computer'."));
    return;
  }
  if (compType == "inverseWear") {
    error(localize("OWG: Operation '" + getParameter("operation-comment", "") + "' uses 'Inverse wear' compensation, which applies Blum wear values with the wrong sign - use 'Wear'."));
    return;
  }
  if (compType != "wear") {
    return;
  }
  var d = tool.diameterOffset;
  if (!(d > 0) || d > 99) {
    error(localize("OWG: Tool " + tool.number + " uses Wear compensation but has an invalid diameter offset number (" + d + ")."));
    return;
  }
  if (d != tool.number) {
    error(localize("OWG: Tool " + tool.number + " uses Wear compensation with D" + d + ". Blum writes wear to row T" + tool.number + " - set the diameter offset equal to the tool number."));
    return;
  }
  var limit = getProperty("maxDiameterWear");
  if (!(limit > 0)) {
    error(localize("OWG: 'Max diameter wear for Wear comp' must be greater than zero."));
    return;
  }
  writeBlock("#" + (13000 + d) + "=0.", formatComment("WEAR COMP - GEOMETRY MUST BE 0"));
  var ok = nextGuardLabel();
  writeRawBlock("IF [ABS[#" + (12000 + d) + "] LE " + macroNum(limit) + "] GOTO " + ok);
  writeRawBlock("#3000=121(T" + d + " WEAR OVER LIMIT)");
  writeRawBlock("N" + ok);
}

/**
 * OWG v3_7: Restores a known controller state after ANY Blum tool check macro.
 *
 * Exit states of the macros this post calls:
 * - Blum V5DE laser (O8602/O8603/O8607/O8608, also via O6008/O6009): O8639 end
 *   of cycle leaves G91 + G49 active, Z at G28 reference, XY over the laser.
 *   O8670 also commands G69 (cancels G68/G68.2).
 * - Blum Z-Nano (P8915): leaves G90 + G43 active at its safe Z above the setter.
 *
 * The post's modal caches must not be trusted after either, so this:
 * 1. Returns Z to reference (G28 G91 Z0.) and sends G90 G17 G40 G80 G94 explicitly.
 * 2. Cancels length comp with G49 at Z reference (SM4054-safe).
 * 3. Zeroes #[13000+T].
 * 4. Invalidates rotation, work plane, WCS, axis, spindle and coolant caches so the
 *    next section re-sends WCS and performs a full G43 approach move.
 *
 * @param {number} [toolNum]
 */
function restoreModalStateAfterToolCheck(toolNum) {
  writeComment("RESTORE MODAL STATE AFTER BLUM CYCLE");
  forceModals(gMotionModal, gAbsIncModal);
  writeBlock(gFormat.format(28), gAbsIncModal.format(91), "Z0.");
  forceModals();
  gCycleModal.reset();
  writeBlock(gAbsIncModal.format(90), gPlaneModal.format(17), gFormat.format(40), gCycleModal.format(80), gFeedModeModal.format(94));
  state.retractedZ = true;
  toolLengthCompOutput.reset();
  writeBlock(toolLengthCompOutput.format(49));
  state.lengthCompensationActive = false;
  ensureWearModeZeroComp(toolNum);
  if (typeof gRotationModal != "undefined") {
    gRotationModal.reset();
  }
  if (typeof forceWorkPlane == "function") {
    forceWorkPlane();
  }
  currentWorkOffset = undefined;
  forceAny();
  forceSpindleSpeed = true;
  forceCoolant = true;
}

/**
 * OWG v3_5: Calculates precision radial offset (X) and axial height (Z) for Blum Laser NT macros
 * based on exact tool geometry from Fusion 360:
 * - Flat End Mills:
 *     Length: X = (D/2) * 0.80 (avoids center web recess), Z = 0.5mm
 *     Wear:   X = (D/2) * 0.80, Z = clamp(0.10, 0.50, fluteLength * 0.20)
 * - Ball Nose Mills:
 *     Length: X = 0.0 (apex), Z = 0.5mm
 *     Wear:   X = 0.0, Z = D / 2.0 (equator)
 * - Corner Radius / Bullnose Mills:
 *     Length: X = max(0.1, (D/2 - CR) * 0.80) (flat bottom face), Z = 0.5mm
 *     Wear:   X = max(0.1, (D/2 - CR) * 0.80), Z = CR + 0.30mm (above corner radius)
 * - Drills / Centric Tools:
 *     Length: Centric macro O8602 (X = 0.0, K = -3.0)
 *     Wear:   X = 0.0, Z = coneHeight + 0.50mm margin (coneHeight = (D/2) / tan(tipAngle/2))
 * - T-Slot Cutters / Slot Mills:
 *     Length: X = ((D/2) + (neckDia/2)) / 2 (midpoint of bottom cutting ring), Z = 0.5mm
 *     Wear:   X = ((D/2) + (neckDia/2)) / 2, Z = fluteLength / 2.0 (disc thickness center)
 * - Dovetail Cutters:
 *     Length: X = max(0.1, (D/2 - CR) * 0.80), Z = 0.5mm
 *     Wear:   X = max(0.1, (D/2 - CR) * 0.80), Z = max(0.10, CR + 0.15mm)
 * - Lollipop End Mills:
 *     Length: X = 0.0 (apex), Z = 0.5mm
 *     Wear:   X = 0.0, Z = D / 2.0 (equator)
 *     Scan:   Blum O8607 spherical arc contour scanning (I25. J[D/2] K135. V0. F100.)
 * 
 * OWG v3_6 Updates:
 * - Fixed drill taperAngle units: converted from Fusion radians to degrees for cone height calculation.
 * - Fixed lollipop misclassification: only classify as lollipop if explicit reduced neck is present.
 * - Wrapped all metric constants in toPreciseUnit(..., MM) for full inch (G20) compatibility.
 * 
 * @param {Tool} tool Fusion 360 tool object
 * @param {string} measureType "length" or "wear"
 * @returns {object} {x: number, z: number, k: number, isLollipop: boolean, isCentric: boolean, isSlot: boolean, isDovetail: boolean}
 */
function calculateLaserMeasurementGeometry(tool, measureType) {
  var d = tool.diameter;
  var cr = (tool.cornerRadius && tool.cornerRadius > 0) ? tool.cornerRadius : 0.0;
  var fl = (tool.fluteLength && tool.fluteLength > 0) ? tool.fluteLength : 0.0;
  var neck = (tool.neckDiameter && tool.neckDiameter > 0) ? tool.neckDiameter :
             ((tool.shaftDiameter && tool.shaftDiameter > 0) ? tool.shaftDiameter : (d * 0.5));
  
  // OWG v3_7: TOOL_MILLING_BALL does not exist in the Fusion API (always undefined);
  // the correct constants are TOOL_MILLING_END_BALL and TOOL_MILLING_LOLLIPOP.
  var isBall = isToolType(tool, "ball") || isToolType(tool, "lollipop") ||
               (cr >= (d / 2.0) - toPreciseUnit(0.001, MM));
  // OWG v3_6: Only classify as lollipop if neck diameter is explicitly specified and less than diameter,
  // or explicitly identified by comment/description. Never fallback to d * 0.5 for lollipop detection!
  var hasExplicitReducedNeck = (tool.neckDiameter && tool.neckDiameter > 0 && tool.neckDiameter < (d - toPreciseUnit(0.01, MM)));
  var isLollipop = isBall && (
    isToolType(tool, "lollipop") ||
    hasExplicitReducedNeck ||
    (tool.comment && tool.comment.toLowerCase().indexOf("lollipop") !== -1) ||
    (tool.description && tool.description.toLowerCase().indexOf("lollipop") !== -1)
  );
  var isCentric = isCentricTool(tool);
  var isSlot = isToolType(tool, "slot");
  var isDovetail = isToolType(tool, "dovetail");

  var xVal = 0.0;
  var zVal = toPreciseUnit(0.5, MM);
  var kVal = 0.0;

  if (measureType === "length") {
    // OWG v3_7: only flat-bottomed types may be measured off-centre (see getLaserLengthMethod)
    var lengthMethod = getLaserLengthMethod(tool);
    if (lengthMethod == "centric") {
      kVal = -3.0; // Measured on centre via P8602 (drills, taps, and all profiled/unknown types)
      xVal = 0.0;
      zVal = toPreciseUnit(0.5, MM);
    } else if (lengthMethod == "ball") {
      kVal = -1.0;
      xVal = 0.0;
      zVal = toPreciseUnit(0.5, MM);
    } else if (isSlot) {
      kVal = -4.0;
      xVal = Math.round((((d / 2.0) + (neck / 2.0)) / 2.0) * 1000) / 1000;
      zVal = toPreciseUnit(0.5, MM);
    } else if (isDovetail) {
      kVal = cr;
      xVal = Math.max(toPreciseUnit(0.10, MM), Math.round(((d / 2.0) - cr) * 0.80 * 1000) / 1000);
      zVal = toPreciseUnit(0.5, MM);
    } else if (cr > 0.0) {
      kVal = cr;
      xVal = Math.max(toPreciseUnit(0.10, MM), Math.round(((d / 2.0) - cr) * 0.80 * 1000) / 1000);
      zVal = toPreciseUnit(0.5, MM);
    } else {
      // Flat end mill
      kVal = 0.0;
      xVal = Math.round((d / 2.0) * 0.80 * 1000) / 1000;
      zVal = toPreciseUnit(0.5, MM);
    }
  } else {
    // measureType === "wear"
    if (isCentric) {
      kVal = -3.0;
      xVal = 0.0;
      // OWG v3_6: Fusion 360 stores tool.taperAngle in RADIANS.
      // Convert to degrees before calculating point cone height.
      var tipAngle = 118.0;
      if (tool.taperAngle && tool.taperAngle > 0) {
        tipAngle = tool.taperAngle * 180.0 / Math.PI;
      }
      var halfAngleRad = (tipAngle / 2.0) * (Math.PI / 180.0);
      var coneHeight = (d / 2.0) / Math.tan(halfAngleRad);
      zVal = Math.round((coneHeight + toPreciseUnit(0.50, MM)) * 1000) / 1000; // 0.5mm above cone onto cylindrical margin
    } else if (isBall || isLollipop) {
      kVal = -1.0;
      xVal = 0.0;
      zVal = Math.round((d / 2.0) * 1000) / 1000; // Equator (maximum diameter of sphere)
    } else if (isSlot) {
      kVal = -4.0;
      xVal = Math.round((((d / 2.0) + (neck / 2.0)) / 2.0) * 1000) / 1000;
      zVal = fl > 0 ? Math.round((fl / 2.0) * 1000) / 1000 : toPreciseUnit(1.50, MM); // Axial midpoint of cutter blade
    } else if (isDovetail) {
      kVal = cr;
      xVal = Math.max(toPreciseUnit(0.10, MM), Math.round(((d / 2.0) - cr) * 0.80 * 1000) / 1000);
      zVal = Math.max(toPreciseUnit(0.10, MM), Math.round((cr + toPreciseUnit(0.15, MM)) * 1000) / 1000); // Just above bottom corner prep
    } else if (cr > 0.0) {
      kVal = cr;
      xVal = Math.max(toPreciseUnit(0.10, MM), Math.round(((d / 2.0) - cr) * 0.80 * 1000) / 1000);
      zVal = Math.round((cr + toPreciseUnit(0.30, MM)) * 1000) / 1000; // Clear corner radius onto side flute
    } else {
      // Flat end mill
      kVal = 0.0;
      xVal = Math.round((d / 2.0) * 0.80 * 1000) / 1000;
      var rawZ = fl > 0 ? (fl * 0.20) : (d * 0.15);
      zVal = Math.max(toPreciseUnit(0.10, MM), Math.min(toPreciseUnit(0.50, MM), Math.round(rawZ * 1000) / 1000));
    }
  }

  return {
    x: xVal,
    z: zVal,
    k: kVal,
    isLollipop: isLollipop,
    isCentric: isCentric,
    isSlot: isSlot,
    isDovetail: isDovetail
  };
}

/**
 * Emits call to O6009 Laser Wear & Runout measuring macro.
 * Call format: G65 P6009 T.. D.. C.. K.. S.. Q..
 * 
 * @param {Tool} tool
 * @param {boolean} preMeasure True if running during initial start-of-program checks
 */
function writeLaserWearBlock(tool, preMeasure) {
  var maxLaserDiameter = toPreciseUnit(24.0, MM);
  if (tool.diameter > maxLaserDiameter) {
    error(localize("Tool " + toolFormat.format(tool.number) + " diameter (" + xyzFormat.format(tool.diameter) + ") exceeds 24mm Blum Laser NT aperture limit for wear measurement."));
    return;
  }

  // OWG v3_7: metric only, and only tool types O6009 can measure correctly
  if (!requireMetricForLaser("Laser wear check on tool " + tool.number)) {
    return;
  }
  if (!isLaserWearSupportedType(tool)) {
    error(localize("OWG: Tool " + tool.number + " (" + getToolTypeName(tool.type) + ") is not supported by the O6009 laser wear check."));
    return;
  }

  if (!preMeasure) {
    prepareForToolCheck();
  }

  var geom = calculateLaserMeasurementGeometry(tool, "wear");
  var flutes = (tool.numberOfFlutes && tool.numberOfFlutes > 0) ? tool.numberOfFlutes : (geom.isCentric ? 2 : 4);
  var rpm = Math.max(3000, Math.round(tool.spindleRPM || 3000));
  // OWG v3_7: no silent fallback to the break tolerance (a 0 here used to become 0.0025 mm)
  var qVal = getProperty("laserRunoutTolerance");
  var uVal = getProperty("maxDiameterWear");
  if (!(qVal > 0) || !(uVal > 0)) {
    error(localize("OWG: 'Laser NT max runout tolerance' and 'Max diameter wear' must both be greater than zero."));
    return;
  }

  // Check if spherical contour scan is requested for lollipop tool
  var wantScan = geom.isLollipop && (getProperty("scanLollipopContour") || (tool.comment && tool.comment.toUpperCase().indexOf("[LASER SCAN]") !== -1));

  if (wantScan) {
    writeComment("BLUM LASER NT SPHERICAL CONTOUR SCAN (O8607)");
    writeBlock(mFormat.format(3), sOutput.format(rpm));
    writeBlock(mFormat.format(159)); // flush lookahead
    writeBlock(gFormat.format(4), "X1.5"); // settle spindle
    writeBlock(
      gFormat.format(65),
      "P8607",
      "H" + macroNum(tool.number),
      "D" + macroNum(tool.number),
      "C" + macroNum(flutes),
      "Q" + macroNum(qVal),
      "X0.",
      "I25.",
      "J" + macroNum(geom.z),
      "K135.",
      "V0.",
      "F100.",
      formatComment("CONTOUR SCAN")
    );
    writeBlock(mFormat.format(5)); // stop spindle
  } else {
    writeComment("BLUM LASER NT WEAR AND RUNOUT MEASUREMENT (O6009)");
    writeBlock(
      gFormat.format(65),
      "P6009",
      "T" + macroNum(tool.number),
      "D" + macroNum(tool.diameter),
      "C" + macroNum(flutes),
      "K" + macroNum(geom.k),
      "S" + macroNum(rpm),
      "Q" + macroNum(qVal),
      "U" + macroNum(uVal),
      "Z" + macroNum(geom.z),
      "X" + macroNum(geom.x),
      formatComment("LASER WEAR CHECK")
    );
  }

  restoreModalStateAfterToolCheck(tool.number);
}

/**
 * Emits the tool length measurement for one tool, following getLengthPlan():
 * - "laser": O6008 B3 (measure and write)
 * - "znano": M19 + P8915 B0, then O6008 B2 compare-only if the plan says so
 * - "none":  nothing (refused when explicitly requested in-cycle)
 *
 * @param {Tool} tool
 * @param {boolean} preMeasure True if running during initial start-of-program checks
 */
function writeToolMeasureBlock(tool, preMeasure) {
  var comment = measureTool ? formatComment("MEASURE TOOL") : "";

  if (getProperty("probingType") == "Renishaw") {
    if (!preMeasure) {
      prepareForToolCheck();
    }
    writeBlock(
      gFormat.format(65),
      "P9921",
      "M" + 22 + ".",
      "T" + toolFormat.format(tool.number),
      "D" + macroNum(tool.diameter), // OWG v3_7: was "D12.7." (double decimal point)
      comment
    );
    measureTool = false;
    return;
  }

  var plan = getLengthPlan(tool);
  if (plan.setter == "none") {
    if (!preMeasure) {
      error(localize("OWG: A length measurement was requested for tool " + tool.number + ", which is on the Never-measure list / tagged [NO MEASURE]."));
    }
    measureTool = false;
    return;
  }

  if (!preMeasure) {
    prepareForToolCheck();
  }

  if (plan.setter == "laser") {
    // Blum Laser NT length measurement via O6008 (B3 = measure and write)
    if (requireMetricForLaser("Laser length measurement on tool " + tool.number)) {
      writeLaserLengthBlock(tool, 3);
      restoreModalStateAfterToolCheck(tool.number);
    }
  } else {
    // Blum Z-Nano Touch tool setter via P8915
    writeComment("BLUM Z-NANO TOUCH TOOL LENGTH MEASUREMENT");
    writeBlock(mFormat.format(19)); // orientate spindle
    var offsetTool = (tool.type == TOOL_MILLING_SLOT || tool.type == TOOL_MILLING_FACE) && (tool.diameter > measureToolMaxDiameter);
    writeBlock(
      gFormat.format(65),
      "P8915",
      "B0.",
      "H" + toolFormat.format(tool.number),
      conditional(offsetTool, "R" + xyzFormat.format(tool.diameter / 2)),
      conditional(tool.type == TOOL_MILLING_FACE && measureAllFlutes && offsetTool, "D" + macroNum(tool.numberOfFlutes)),
      formatComment("Z-NANO LENGTH MEASURE")
    );
    restoreModalStateAfterToolCheck(tool.number);

    // OWG v3_7: laser shadow check of the Z-Nano length (Blum control mode, writes nothing)
    if (plan.compare) {
      writeLaserLengthBlock(tool, 2);
      restoreModalStateAfterToolCheck(tool.number);
    }
  }
  measureTool = false;
}

/**
 * OWG v3_7: Emits the O6008 laser length call.
 * mode 3 = measure and write length (Blum B3)
 * mode 2 = compare only against the table length (Blum B2 control mode, writes
 *          nothing; alarms if the difference exceeds Q; difference stored in #582)
 */
function writeLaserLengthBlock(tool, mode) {
  var geom = calculateLaserMeasurementGeometry(tool, "length");
  var flutes = (tool.numberOfFlutes && tool.numberOfFlutes > 0) ? tool.numberOfFlutes : (geom.isCentric ? 2 : 4);
  var rpm = Math.max(3000, Math.round(tool.spindleRPM || 3000));
  var qVal = (mode == 2) ? getProperty("laserLengthCompareTolerance") : 0.025;
  if (!(qVal > 0)) {
    error(localize("OWG: 'Laser compare tolerance' must be greater than zero."));
    return;
  }
  writeComment((mode == 2) ? "BLUM LASER NT LENGTH COMPARE ONLY (O6008 B2)" : "BLUM LASER NT TOOL LENGTH MEASUREMENT (O6008 B3)");
  writeBlock(
    gFormat.format(65),
    "P6008",
    "B" + macroNum(mode),
    "T" + macroNum(tool.number),
    "D" + macroNum(tool.diameter),
    "C" + macroNum(flutes),
    "K" + macroNum(geom.k),
    "S" + macroNum(rpm),
    "Q" + macroNum(qVal),
    "Z" + macroNum(geom.z),
    "X" + macroNum(geom.x),
    formatComment((mode == 2) ? "LASER LENGTH COMPARE" : "LASER LENGTH MEASURE")
  );
}

/** OWG v3_7: reads a per-operation boolean property (Post Process tab checkbox). */
function sectionFlag(section, name) {
  try {
    return (typeof section.getProperty == "function") && (section.getProperty(name, false) == true);
  } catch (e) {
    return false;
  }
}

/**
 * Handles start-of-program tool length and wear/runout measurement sequences.
 * OWG v3_7: prints a measurement plan for every tool, then measures the selected ones.
 */
function writeMeasureTools() {
  // Save showSequenceNumbers setting and then disable it
  var show = getProperty("showSequenceNumbers");
  setProperty("showSequenceNumbers", "false");

  var tools = getToolTable();
  var startLength = getProperty("startLengthMeasure");
  var startWear = getProperty("startWearCheck");

  // OWG v3_7: tools ticked in any operation's Post Process tab
  var checkedLength = {};
  var checkedWear = {};
  for (var si = 0; si < getNumberOfSections(); ++si) {
    var section = getSection(si);
    var sectionTool = section.getTool();
    if (sectionFlag(section, "opMeasureLength")) {
      checkedLength[sectionTool.number] = true;
    }
    if (sectionFlag(section, "opLaserWear")) {
      checkedWear[sectionTool.number] = true;
    }
  }

  // OWG v3_7: resolve and print the measurement plan for every tool in the program
  var jobs = [];
  var planLines = [];
  for (var i = 0; i < tools.getNumberOfTools(); ++i) {
    var tool = tools.getTool(i);
    if (tool.type == TOOL_PROBE) {
      continue;
    }
    var lengthPlan = getLengthPlan(tool);
    var doLength = (lengthPlan.setter != "none") &&
      ((startLength == "all") || (startLength == "checked" && checkedLength[tool.number] == true));
    var wantWear = (startWear == "all") ||
      (startWear == "checked" && (checkedWear[tool.number] == true || toolHasTag(tool, ["[LASER WEAR]"])));
    var wearPlan = getWearPlan(tool, wantWear);

    var setterText = (lengthPlan.setter == "laser") ? "LASER" : (lengthPlan.compare ? "ZNANO+LASER CMP" : "ZNANO");
    var lengthText = (lengthPlan.setter == "none") ? "NEVER" : (doLength ? setterText : "NO [" + setterText + "]");
    var why = (lengthPlan.why != "METHOD" && lengthPlan.why != "PROBE" && lengthPlan.why != "NEVER MEASURE") ? " " + lengthPlan.why : "";
    var wearText = wearPlan.check ? "YES" : ((wantWear && wearPlan.why != "NOT SELECTED") ? "NO " + wearPlan.why : "NO");
    planLines.push("T" + toolFormat.format(tool.number) + " D" + xyzFormat.format(tool.diameter) +
      " LEN " + lengthText + why + " WEAR " + wearText);
    if (doLength || wearPlan.check) {
      jobs.push({tool:tool, doLength:doLength, doWear:wearPlan.check});
    }
  }

  writeln("");
  writeComment("MEASUREMENT PLAN - LENGTH METHOD " + String(getProperty("lengthMethod")).toUpperCase());
  writeComment("START LENGTH " + String(startLength).toUpperCase() + " / START WEAR " + String(startWear).toUpperCase());
  for (var p = 0; p < planLines.length; ++p) {
    writeComment(planLines[p]);
    if (typeof log == "function") {
      log("OWG measurement plan: " + planLines[p]);
    }
  }

  if (jobs.length > 0) {
    optionalSection = true;
    writeBlock(mFormat.format(0), formatComment(localize("Read note"))); // wait for operator
    writeComment(localize("With B SKIP turned off each tool be automatically measured"));
    writeComment(localize("Once the tools are verified turn B SKIP on to skip verification"));

    for (var j = 0; j < jobs.length; ++j) {
      var job = jobs[j];
      var comment = "T" + toolFormat.format(job.tool.number) + " " +
        "D=" + xyzFormat.format(job.tool.diameter) + " " +
        localize("CR") + "=" + xyzFormat.format(job.tool.cornerRadius);
      if ((job.tool.taperAngle > 0) && (job.tool.taperAngle < Math.PI)) {
        comment += " " + localize("TAPER") + "=" + taperFormat.format(job.tool.taperAngle) + localize("deg");
      }
      comment += " - " + getToolTypeName(job.tool.type);
      writeComment(comment);

      // Perform tool change to the tool to be measured
      writeBlock("T" + toolFormat.format(job.tool.number), mFormat.format(6));

      if (job.doLength) {
        writeToolMeasureBlock(job.tool, true);
      }
      if (job.doWear) {
        writeLaserWearBlock(job.tool, true);
      }
    }

    // Reload initial tool (side effect to cancel tool length offset)
    var firstToolNum = (getNumberOfSections() > 0) ? getSection(0).getTool().number : tools.getTool(0).number;
    writeComment("Reload initial tool");
    writeBlock("T" + toolFormat.format(firstToolNum), mFormat.format(6));
    restoreModalStateAfterToolCheck(firstToolNum);

    // Pause for operator after measurements
    writeBlock(mFormat.format(0), formatComment(localize("Ready to run")));

    optionalSection = false;
  }
  writeln("");

  // optionally confirm tool lengths
  if (getProperty("confirmToolLengths")) {
    var toolLenBase = 11000;
    var tools = getToolTable();
    optionalSection = true;
    if (tools.getNumberOfTools() > 0) {

      for (var i = 0; i < tools.getNumberOfTools(); ++i) {
        var tool = tools.getTool(i);
        if (tool.type == TOOL_PROBE) {
          continue;
        }

        // Compare tool table len with CAM len and stop if shorter
        var camLen = xyzFormat.format(tool.bodyLength + tool.holderLength);
        var tooltableLen = "#" + (toolLenBase + tool.number);
        var seq = sequenceNumber;
        sequenceNumber += getProperty("sequenceNumberIncrement");
        writeComment("Checking lengths of tool: " + tool.number);
        writeBlock("N" + seq + " IF [" + tooltableLen + " GE " + camLen + "] GOTO " + sequenceNumber);
        writeBlock("#3006=(TOOL " + tool.number + " TOO SHORT)")
      }
      writeBlock("N" + sequenceNumber)
      sequenceNumber += getProperty("sequenceNumberIncrement");
    }
    optionalSection = false;
    writeln("");
  }

  // Restore setting
  setProperty("showSequenceNumbers", show);
}

/* =============================================================================
   OWG v3_3 ORIGINAL writeMeasureTools and writeToolMeasureBlock (COMMENTED OUT FOR v3_4)
   =============================================================================
function writeMeasureTools_v3_3() {
  // Save showSequenceNumbers setting and then disable it
  var show = getProperty("showSequenceNumbers");
  setProperty("showSequenceNumbers", "false");

  // optionally measure tools
  if (getProperty("measureTools")) {
    var tools = getToolTable();
    optionalSection = true;
    if (tools.getNumberOfTools() > 0) {

      writeBlock(mFormat.format(0), formatComment(localize("Read note"))); // wait for operator
      writeComment(localize("With B SKIP turned off each tool be automatically measured"));
      writeComment(localize("Once the tools are verified turn B SKIP on to skip verification"));
      for (var i = 0; i < tools.getNumberOfTools(); ++i) {
        var tool = tools.getTool(i);
        if ((tool.type == TOOL_PROBE) && !measureProbe) {
          continue;
        }
        var comment = "T" + toolFormat.format(tool.number) + " " +
          "D=" + xyzFormat.format(tool.diameter) + " " +
          localize("CR") + "=" + xyzFormat.format(tool.cornerRadius);
        if ((tool.taperAngle > 0) && (tool.taperAngle < Math.PI)) {
          comment += " " + localize("TAPER") + "=" + taperFormat.format(tool.taperAngle) + localize("deg");
        }
        comment += " - " + getToolTypeName(tool.type);
        writeComment(comment);
        writeToolMeasureBlock(tool, true);
      }

      // Reload initial tool (side effect to cancel tool length offset)
      writeComment("Reload initial tool")
      writeBlock("T" + toolFormat.format(getSection(0).getTool().number), mFormat.format(6)); // get tool
    }
    optionalSection = false;
    writeln("");
  }

  // optionally confirm tool lengths
  if (getProperty("confirmToolLengths")) {
    var toolLenBase = 11000;
    var tools = getToolTable();
    optionalSection = true;
    if (tools.getNumberOfTools() > 0) {

      for (var i = 0; i < tools.getNumberOfTools(); ++i) {
        var tool = tools.getTool(i);
        if (tool.type == TOOL_PROBE) {
          continue;
        }

        // Compare tool table len with CAM len and stop if shorter
        var camLen = xyzFormat.format(tool.bodyLength + tool.holderLength);
        var tooltableLen = "#" + (toolLenBase + tool.number);
        var seq = sequenceNumber;
        sequenceNumber += getProperty("sequenceNumberIncrement");
        writeComment("Checking lengths of tool: " + tool.number);
        writeBlock("N" + seq + " IF [" + tooltableLen + " GE " + camLen + "] GOTO " + sequenceNumber);
        writeBlock("#3006=(TOOL " + tool.number + " TOO SHORT)")
      }
      writeBlock("N" + sequenceNumber)
      sequenceNumber += getProperty("sequenceNumberIncrement");
    }
    optionalSection = false;
    writeln("");
  }

  // Pause for operator if we did a tool measure
  if (getProperty("measureTools") && (tools.getNumberOfTools() > 0)) {
    optionalSection = true;
    writeBlock(mFormat.format(0), formatComment(localize("Ready to run")));
    optionalSection = false;
    writeln("");
  }

  // Restore setting
  setProperty("showSequenceNumbers", show);
}

function writeToolMeasureBlock_v3_3(tool, preMeasure) {
  var comment = measureTool ? formatComment("MEASURE TOOL") : "";
  if (!preMeasure) {
    prepareForToolCheck();
  }

  var offsetTool = (tool.type == TOOL_MILLING_SLOT || tool.type == TOOL_MILLING_FACE) && (tool.diameter > measureToolMaxDiameter);
  if (getProperty("probingType") == "Renishaw") {
    // Renishaw untested
    writeBlock(
      gFormat.format(65),
      "P9921",
      "M" + 22 + ".",
      "T" + toolFormat.format(tool.number),
      "D" + xyzFormat.format(tool.diameter) + ".",
      comment
    );
  } else { // Blum
    writeBlock("T" + toolFormat.format(tool.number), mFormat.format(6)); // get tool
    writeBlock(mFormat.format(19)); // orientate spindle
    writeBlock(
      gFormat.format(65),
      "P8915",
      "B0.",
      "H" + toolFormat.format(tool.number),
      // Offset (larger) face/slot-mills by tool radius
      conditional(offsetTool, "R" + xyzFormat.format(tool.diameter / 2)),
      // Measure all flutes
      conditional(tool.type == TOOL_MILLING_FACE && measureAllFlutes && offsetTool, "D" + tool.numberOfFlutes),
      comment
    ); // probe tool
  }
  measureTool = false;
}
   ============================================================================= */


// complete update of onCycleEnd to spoof Renishaw DPRNT
function onCycleEnd() {
  // Custom DPRNT output for Fusion 360 Import Mode.
  // Only fires when:
  //   - the cycle requested print-results,
  //   - the user has selected Blum as the probing system, AND
  //   - probeResultsFormat is set to 'fusion'.
  // In 'raw' mode the Blum macro itself emits its native print file (V-1. is passed
  // through getProbingArguments instead), and we leave it alone here.
  if (cycle && cycle.printResults && getProperty("probingType") == "Blum" && getProperty("probeResultsFormat") == "fusion") {
    
    // 1. Output the mandatory Renishaw Feature Headers exactly on ONE line
    writeln("DPRNT[----------------------------------------]");
    writeln("DPRNT[*COMPONENT*NO*1*FEATURE*NO*" + probeFeatureNumber + "]");
    writeln("DPRNT[----------------------------------------]");

    // Increment the counter so the next probed feature is numbered correctly
    probeFeatureNumber++; 

    // 2. Fetch the nominal values from the CAM operation
    var initialPos = currentSection.getInitialPosition();
    var nomX = xyzFormat.format(initialPos.x);
    var nomY = xyzFormat.format(initialPos.y);
    var nomZ = xyzFormat.format(cycle.bottom);

    // 3. Spoof the Renishaw output strings using Blum Variables
    // WORKAROUND: Using Character Codes to prevent Fusion from stripping brackets
    var bOpen = String.fromCharCode(91); 
    var bClose = String.fromCharCode(93); 
    var fmt = bOpen + "54" + bClose; 

    switch (cycleType) {
      case "probing-x":
        writeBlock("DPRNT[POSN*X" + nomX + "*ACTUAL*#100" + fmt + "*DEV*#103" + fmt + "]");
        break;
      case "probing-y":
        writeBlock("DPRNT[POSN*Y" + nomY + "*ACTUAL*#101" + fmt + "*DEV*#104" + fmt + "]");
        break;
      case "probing-z":
        writeBlock("DPRNT[POSN*Z" + nomZ + "*ACTUAL*#102" + fmt + "*DEV*#105" + fmt + "]");
        break;
      case "probing-xy-circular-hole":
      case "probing-xy-circular-boss":
      case "probing-xy-circular-partial-hole":
      case "probing-xy-circular-partial-boss":
      case "probing-xy-circular-hole-with-island":
      case "probing-xy-circular-partial-hole-with-island":
        var nomSize = xyzFormat.format(cycle.width1);
        writeBlock("DPRNT[SIZE*D" + nomSize + "*ACTUAL*#106" + fmt + "*DEV*#107" + fmt + "]");
        writeBlock("DPRNT[POSN*X" + nomX + "*ACTUAL*#100" + fmt + "*DEV*#103" + fmt + "]");
        writeBlock("DPRNT[POSN*Y" + nomY + "*ACTUAL*#101" + fmt + "*DEV*#104" + fmt + "]");
        break;
      case "probing-x-wall":
      case "probing-x-channel":
      case "probing-x-channel-with-island":
        var nomSizeX = xyzFormat.format(cycle.width1);
        writeBlock("DPRNT[SIZE*X" + nomSizeX + "*ACTUAL*#106" + fmt + "*DEV*#107" + fmt + "]");
        writeBlock("DPRNT[POSN*X" + nomX + "*ACTUAL*#100" + fmt + "*DEV*#103" + fmt + "]");
        break;
      case "probing-y-wall":
      case "probing-y-channel":
      case "probing-y-channel-with-island":
        var nomSizeY = xyzFormat.format(cycle.width1);
        writeBlock("DPRNT[SIZE*Y" + nomSizeY + "*ACTUAL*#106" + fmt + "*DEV*#107" + fmt + "]");
        writeBlock("DPRNT[POSN*Y" + nomY + "*ACTUAL*#101" + fmt + "*DEV*#104" + fmt + "]");
        break;
      case "probing-xy-rectangular-hole":
      case "probing-xy-rectangular-boss":
      case "probing-xy-rectangular-hole-with-island":
        var nomSizeRX = xyzFormat.format(cycle.width1);
        var nomSizeRY = xyzFormat.format(cycle.width2);
        writeBlock("DPRNT[SIZE*X" + nomSizeRX + "*ACTUAL*#106" + fmt + "*DEV*#107" + fmt + "]");
        writeBlock("DPRNT[SIZE*Y" + nomSizeRY + "*ACTUAL*#108" + fmt + "*DEV*#109" + fmt + "]");
        writeBlock("DPRNT[POSN*X" + nomX + "*ACTUAL*#100" + fmt + "*DEV*#103" + fmt + "]");
        writeBlock("DPRNT[POSN*Y" + nomY + "*ACTUAL*#101" + fmt + "*DEV*#104" + fmt + "]");
        break;
      case "probing-xy-inner-corner":
      case "probing-xy-outer-corner":
        writeBlock("DPRNT[POSN*X" + nomX + "*ACTUAL*#100" + fmt + "*DEV*#103" + fmt + "]");
        writeBlock("DPRNT[POSN*Y" + nomY + "*ACTUAL*#101" + fmt + "*DEV*#104" + fmt + "]");
        break;
      default:
        // Don't emit misleading X/Y deviations for cycle types we don't know how to
        // map. The result file will simply skip this feature rather than print zeros.
        writeComment("DPRNT for cycle type '" + cycleType + "' not implemented - skipping");
        break;
    }
  }

  // REQUIRED WRAPPER FOR PROBE RETRACTS
  if (isProbeOperation()) {
    zOutput.reset();
    gMotionModal.reset();
    
    // Retrieve the safe probe feedrate (mm/min) from the property. The property is
    // documented as mm/min; convert to in/min whenever the post is producing inch output.
    var safeProbeFeed = getProperty("safeProbeFeedrate") !== undefined ? getProperty("safeProbeFeedrate") : 5000;
    if (unit == IN) {
      safeProbeFeed = safeProbeFeed / 25.4;
    }

    var feed = getFeed(safeProbeFeed);

    if (getProperty("probingType") == "Renishaw") {
      writeBlock(gFormat.format(65), "P" + 8810, zOutput.format(cycle.retract), feed); 
    } else {
      writeBlock(gFormat.format(65), "P" + 8703, "A1", "M3", zOutput.format(cycle.retract), feed); 
    }
  } else if (!cycleExpanded) {
    writeBlock(gCycleModal.format(80));
    zOutput.reset();
  }
}


var mapCommand = {
  COMMAND_STOP_SPINDLE     : 5,
  COMMAND_ORIENTATE_SPINDLE: 19
};

function onCommand(command) {
  switch (command) {
  case COMMAND_CLEAN:
    writeBlock(mFormat.format(washdownCoolant.on));
    writeBlock(mFormat.format(washdownCoolant.off));
    return;
  case COMMAND_COOLANT_OFF:
    setCoolant(COOLANT_OFF);
    return;
  case COMMAND_COOLANT_ON:
    setCoolant(tool.coolant);
    return;
  case COMMAND_STOP:
    writeBlock(mFormat.format(0));
    forceSpindleSpeed = true;
    forceCoolant = true;
    return;
  case COMMAND_OPTIONAL_STOP:
    writeBlock(mFormat.format(1));
    forceSpindleSpeed = true;
    forceCoolant = true;
    return;
  case COMMAND_START_SPINDLE:
    forceSpindleSpeed = false;
    writeBlock(sOutput.format(spindleSpeed), mFormat.format(tool.clockwise ? 3 : 4));
    return;
  case COMMAND_LOAD_TOOL:
    setMachineLoadMonitor(false); // disable machine load monitoring
    // Output modal commands here
    forceModals();
    writeBlock(gPlaneModal.format(17), gAbsIncModal.format(90), gFeedModeModal.format(94));

    // Let G100 handle coolant change
    forceCoolant = true;
    var coolantCodes = getCoolantCodes(tool.coolant);
    if (Array.isArray(coolantCodes)) {
      coolantCodes = coolantCodes.join(getWordSeparator());
    } else{
      coolantCodes = "";
    }

    var rotateSpindle = !noSpindle();
    var abc = settings.workPlaneMethod.useTiltedWorkplane ? undefined : defineWorkPlane(currentSection, false);
    var start = getFramePosition(currentSection.getInitialPosition());
    var preloadTool = getNextTool(tool.number != getFirstTool().number);
    var separateZOnToolChange = getProperty("separateZOnToolChange");
    writeToolBlock(gFormat.format(100),
      "T" + toolFormat.format(tool.number),
      xOutput.format(start.x),
      yOutput.format(start.y),
      getOffsetCode(),
      !separateZOnToolChange ? zOutput.format(start.z) : undefined,
      abc ? aOutput.format(abc.x) : undefined,
      abc ? bOutput.format(abc.y) : undefined,
      abc ? cOutput.format(abc.z) : undefined,
      (getProperty("preloadTool") && preloadTool) ? "L" + toolFormat.format(preloadTool.number) : undefined,
      hFormat.format(tool.lengthOffset),
      rotateSpindle ? diameterOffsetFormat.format(tool.diameterOffset) : "",
      rotateSpindle ? sOutput.format(spindleSpeed) : "",
      rotateSpindle ? mFormat.format(tool.clockwise ? 3 : 4) : "",
      coolantCodes
    );
    if (separateZOnToolChange) {
      writeBlock(gFormat.format(43),
        zOutput.format(start.z),
        hFormat.format(tool.lengthOffset)
      );
    }
    writeComment(tool.comment);
    // OWG v3_4: Ensure wear compensation geometry register is cleared at tool change
    ensureWearModeZeroComp(tool.number);
    currentWorkPlaneABC = abc ? abc : currentWorkPlaneABC; // workplane is set with the G100 command

    if (measureTool) {
      writeToolMeasureBlock(tool, false);
      setCoolant(tool.coolant);
      startSpindle(tool, true);
      // OWG v3_7: the measuring cycle moved the tool away from the G100 start position and
      // cancelled length comp - onSection must do a full XY + G43 Z H approach move.
      repositionAfterToolCheck = true;
    }
    forceSpindleSpeed = false;

    // for machine simulation, with TCP enabled G100 acts like prepositionWithTWP
    if (abc != undefined) {
      setCurrentABC(abc); // required for machine simulation
      machineSimulation({a:getCurrentABC().x, b:getCurrentABC().y, c:getCurrentABC().z, coordinates:MACHINE, mode:TCPOFF});
    }
    var W = currentSection.workPlane;
    var prePosition = start;
    var angles = undefined;
    if (tcp.isSupportedByOperation) {
      W = machineConfiguration.isMultiAxisConfiguration() ? machineConfiguration.getOrientation(getCurrentABC()) :
        Matrix.getOrientationFromDirection(getCurrentABC());
      prePosition = W.getTransposed().multiply(start);
      angles = W.getEuler2(settings.workPlaneMethod.eulerConvention);
    }
    machineSimulation({mode:tcp.isSupportedByOperation ? TCPOFF : undefined});
    machineSimulation({x:prePosition.x, y:prePosition.y, mode:tcp.isSupportedByOperation ? TWPON : undefined, eulerAngles:angles});
    machineSimulation(tcp.isSupportedByOperation ? {x:start.x, y:start.y, z:start.z} : {z:start.z});
    currentToolNumber = tool.number;
    return;
  case COMMAND_LOCK_MULTI_AXIS:
    if (machineConfiguration.isMultiAxisConfiguration()) {
      if (aOutput.isEnabled()) {
        writeBlock(fourthAxisClamp.format(443)); // lock A-axis
      }
      if (bOutput.isEnabled()) {
        writeBlock(fifthAxisClamp.format(441)); // lock B-axis
      }
      if (cOutput.isEnabled()) {
        writeBlock(sixthAxisClamp.format(445)); // lock C-axis
      }
    }
    return;
  case COMMAND_UNLOCK_MULTI_AXIS:
    var outputClampCodes = getProperty("useClampCodes") || currentSection.isMultiAxis();
    if (outputClampCodes && machineConfiguration.isMultiAxisConfiguration()) {
      if (aOutput.isEnabled()) {
        writeBlock(fourthAxisClamp.format(442)); // unlock A-axis
      }
      if (bOutput.isEnabled()) {
        writeBlock(fifthAxisClamp.format(440)); // unlock B-axis
      }
      if (cOutput.isEnabled()) {
        writeBlock(sixthAxisClamp.format(444)); // unlock C-axis
      }
    }
    return;
  case COMMAND_START_CHIP_TRANSPORT:
    return;
  case COMMAND_STOP_CHIP_TRANSPORT:
    return;
  case COMMAND_BREAK_CONTROL:
    if (!toolChecked) { // avoid duplicate COMMAND_BREAK_CONTROL
      writeln("");
      writeComment("PERFORMING TOOL BREAK DETECTION");
      prepareForToolCheck();

      /* OWG v3_3 original break control code commented out for v3_4 upgrade
      var offsetTool = tool.type == (TOOL_MILLING_SLOT || tool.type == TOOL_MILLING_FACE) && (tool.diameter > measureToolMaxDiameter);
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(
          gFormat.format(65),
          "P" + 8858,
          "B1", // B1=length only, B2=diam only, B3=length and diameter
          "H" + xyzFormat.format(getProperty("toolBreakageTolerance")),
          "T" + toolFormat.format(tool.number)
        );
      } else {
        writeBlock(
          gFormat.format(65),
          "P" + 8915,
          "B2",
          "Q" + xyzFormat.format(getProperty("toolBreakageTolerance")),
          // Offset (larger) face/slot-mills by tool radius
          conditional(offsetTool, "R" + xyzFormat.format(tool.diameter / 2)),
          // Measure all flutes
          conditional(tool.type == TOOL_MILLING_FACE && measureAllFlutes && offsetTool, "D" + tool.numberOfFlutes)
        );
      }
      toolChecked = true;
      state.lengthCompensationActive = false; // Tool check macros cancel tool length compensation
      */

      // OWG v3_4: Determine break control setter based on comment tags, diameter, and post properties
      var breakSetter = getToolSetterType(tool, "break");

      if (getProperty("probingType") == "Renishaw") {
        writeBlock(
          gFormat.format(65),
          "P" + 8858,
          "B1", // B1=length only, B2=diam only, B3=length and diameter
          "H" + xyzFormat.format(getProperty("toolBreakageTolerance")),
          "T" + toolFormat.format(tool.number),
          formatComment("RENISHAW BREAK CHECK")
        );
      } else if (breakSetter === "laserNT" && requireMetricForLaser("Laser break detection on tool " + tool.number)) {
        // Blum Laser NT break detection via P8608
        // Call format: G65 P8608 H[tool.number] X0. M1. Q[toolBreakageTolerance] W0.
        writeComment("BLUM LASER NT TOOL BREAK DETECTION");
        writeBlock(
          gFormat.format(65),
          "P8608",
          "H" + macroNum(tool.number),
          "X0.",
          "M1.",
          "Q" + macroNum(getProperty("toolBreakageTolerance")),
          "W0.",
          formatComment("LASER BREAK CHECK")
        );
      } else {
        // Blum Z-Nano Touch tool setter break detection via P8915
        writeComment("BLUM Z-NANO TOUCH TOOL BREAK DETECTION");
        var offsetTool = (tool.type == TOOL_MILLING_SLOT || tool.type == TOOL_MILLING_FACE) && (tool.diameter > measureToolMaxDiameter);
        writeBlock(
          gFormat.format(65),
          "P8915",
          "B2.",
          "Q" + macroNum(getProperty("toolBreakageTolerance")),
          conditional(offsetTool, "R" + xyzFormat.format(tool.diameter / 2)),
          conditional(tool.type == TOOL_MILLING_FACE && measureAllFlutes && offsetTool, "D" + macroNum(tool.numberOfFlutes)),
          formatComment("Z-NANO BREAK CHECK")
        );
      }

      toolChecked = true;
      restoreModalStateAfterToolCheck(tool.number);
    }
    return;
  case COMMAND_TOOL_MEASURE:
    measureTool = true;
    return;
  case COMMAND_PROBE_ON:
    return;
  case COMMAND_PROBE_OFF:
    return;
  case COMMAND_VERIFY:
    writeln("");
    writeComment("Stop for verification");
    optionalSection = true;
    forceSpindleSpeed = true;
    forceCoolant = true;
    if (!state.retractedZ) {
      writeRetract(Z);
    }
    if (getProperty("positionAtEnd") != "noMove") {
      writeRetract(X, Y);
    }
    writeBlock(mFormat.format(0));
    optionalSection = false;
    return;
  }

  var stringId = getCommandStringId(command);
  var mcode = mapCommand[stringId];
  if (mcode != undefined) {
    writeBlock(mFormat.format(mcode));
  } else {
    onUnsupportedCommand(command);
  }
}

function onSectionEnd() {
  if (currentSection.isMultiAxis()) {
    writeBlock(gFeedModeModal.format(94)); // inverse time feed off
  }
  if (isInspectionOperation() && !isLastSection()) {
    writeBlock(getProperty("commissioningMode") ? onCommand(COMMAND_STOP) : "");
  }
  writeBlock(gPlaneModal.format(17));

  // Fixed bug where G54.2 was not reenabled after op with no tool change.
  // Using indexOf is robust to compound WCS strings that put G54.2 P on a second line
  // (e.g. "G54\nG54.2 P3"), since the position of "G54.2 P" varies.
  if (currentSection.wcs.indexOf("G54.2 P") !== -1) {
    writeBlock(gFormat.format(54.2), "P" + 0); // cancel G54.2
    currentWorkOffset = undefined; // Forces Fusion to turn G54.2 back on for the next operation
  }

  if ((((getCurrentSectionId() + 1) >= getNumberOfSections()) ||
      (tool.number != getNextSection().getTool().number)) &&
      tool.breakControl) {
    onCommand(COMMAND_BREAK_CONTROL);
  } else {
    toolChecked = false;
  }

  if (tool.type != TOOL_PROBE && getProperty("washdownCoolant") == "operationEnd") {
    writeBlock(washdownModal.format(washdownCoolant.on));
    writeBlock(washdownModal.format(washdownCoolant.off));
  }
  if (!isLastSection()) {
    if (getNextSection().getTool().coolant != tool.coolant) {
      setCoolant(COOLANT_OFF);
    }
    if (tool.breakControl && isToolChangeNeeded(getNextSection(), getProperty("toolAsName") ? "description" : "number")) {
      onCommand(COMMAND_BREAK_CONTROL);
    }
  }
  if (isProbeOperation()) {
    if (!hasNextSection() || !(isProbeOperation(getNextSection()) && (getNextSection().getTool().number == tool.number))) {
      // Turn off probe UNLESS next op is another probe with the same tool
      if (getProperty("probingType") == "Renishaw") {
        writeBlock(settings.probing.macroCall, "P" + 8833); // spin the probe off
      } else {
        writeBlock(settings.probing.macroCall, "P" + 8703, "A0", "M2", "X" + 0); // Zero move to turn off probe
      }
      settings.probing.probeOn = false;
    }

    if (settings.probing.probeAngleMethod != "G68") {
      setProbeAngle(); // output probe angle rotations if required
    }
  }
  if (typeof inspectionProcessSectionEnd == "function") {
    inspectionProcessSectionEnd();
  }
  forceAny();
  setAllowedCircularPlanes(currentSection.getId());
}

function setAllowedCircularPlanes(sectionId) {
  if ((sectionId + 1) < getNumberOfSections()) {
    var section = getSection(sectionId + 1);
    allowedCircularPlanes = ((section.getType() == TYPE_MILLING) && getSetting("workPlaneMethod.useTiltedWorkplane", false) && defineWorkPlane(section, false).isNonZero()) ?
      1 << PLANE_XY : undefined; // only XY plane is supported for 3+2 in TWP state
  }
}

function writeRetract() {
  var retract = getRetractParameters.apply(this, arguments);
  if (retract && retract.words.length > 0) {
    if (typeof cancelWCSRotation == "function" && getSetting("retract.cancelRotationOnRetracting", false)) { // cancel rotation before retracting
      cancelWCSRotation();
    }
    if (typeof disableLengthCompensation == "function" && getSetting("allowCancelTCPBeforeRetracting", false) && state.tcpIsActive) {
      disableLengthCompensation(); // cancel TCP before retracting
    }
    if (retract.retractAxes[2] && state.tcpIsActive) {
      writeBlock(gFormat.format(100), "T" + toolFormat.format(currentToolNumber));
      machineSimulation({mode:RETRACTTOOLAXIS});
      return;
    }
    for (var i in retract.words) {
      var words = retract.singleLine ? retract.words : retract.words[i];
      switch (retract.method) {
      case "G28":
        forceModals(gMotionModal, gAbsIncModal);
        writeBlock(gFormat.format(28), gAbsIncModal.format(91), words);
        writeBlock(gAbsIncModal.format(90));
        break;
      case "G53":
        forceModals(gMotionModal);
        writeBlock(gAbsIncModal.format(90), gFormat.format(53), gMotionModal.format(0), words);
        break;
      default:
        if (typeof writeRetractCustom == "function") {
          writeRetractCustom(retract);
          return;
        } else {
          error(subst(localize("Unsupported safe position method '%1'"), retract.method));
        }
      }
      machineSimulation({
        x          : retract.singleLine || words.indexOf("X") != -1 ? retract.positions.x : undefined,
        y          : retract.singleLine || words.indexOf("Y") != -1 ? retract.positions.y : undefined,
        z          : retract.singleLine || words.indexOf("Z") != -1 ? retract.positions.z : undefined,
        coordinates: MACHINE
      });
      if (retract.singleLine) {
        break;
      }
    }
  }
}

function onClose() {
  optionalSection = false;
  if (isDPRNTopen) {
    writeln("DPRNT[END]");
    writeBlock("PCLOS");
    isDPRNTopen = false;
  }
  writeRetract(Z); // retract
  disableLengthCompensation(true);

  if (probeVariables.probeAngleMethod == "G68") {
    cancelWCSRotation();
  }
  writeln("");

  setCoolant(COOLANT_OFF);
  if (getNumberOfSections() > 0) {
    if (tool.type != TOOL_PROBE) {
      setMachineLoadMonitor(false); // disable machine load monitoring
      if (getProperty("washdownCoolant") == "programEnd") {
        writeBlock(washdownModal.format(washdownCoolant.on));
      }
      writeBlock(washdownModal.format(washdownCoolant.off));
    }

    if (getProperty("partsCounter211")) {
      writeComment("ACTIVATE PARTS COUNTER");
      writeBlock("M211");
    }
    if (getProperty("partsCounter212")) {
      writeComment("ACTIVATE PARTS COUNTER 2");
      writeBlock("M212");
    }
    if (getProperty("partsCounter213")) {
      writeComment("ACTIVATE PARTS COUNTER 3");
      writeBlock("M213");
    }
    if (getProperty("partsCounter214")) {
      writeComment("ACTIVATE PARTS COUNTER 4");
      writeBlock("M214");
    }

    var firstToolNumber = getSection(0).getTool().number;
    writeBlock(gFormat.format(100), "T" + toolFormat.format(firstToolNumber));
    // Program-end XY retract: respect positionAtEnd == "noMove" so the
    // operator's choice in the property dialog actually takes effect.
    if (getProperty("positionAtEnd") != "noMove" &&
        getSetting("retract.homeXY.onProgramEnd", false)) {
      writeRetract(settings.retract.homeXY.onProgramEnd);
    }
  }

  setSmoothing(false);
  setWorkPlane(new Vector(0, 0, 0)); // reset working plane
  if (typeof inspectionProcessSectionEnd == "function") {
    inspectionProcessSectionEnd();
  }
  writeBlock(mFormat.format(30)); // stop program, spindle stop, coolant off
}

function onMovement(movement) {
  if ((currentSection.strategy == "adaptive" || currentSection.strategy == "adaptive2d" || currentSection.strategy == "pocket2d") && getProperty("rapidTransitions")) {
    if (getProperty("smoothingMode") != "M298") {
      error(localize("Rapid transitions can only be used in M298 accuracy mode"));
    }
    // During non engaged moves, including leads, we turn off accuracy modes, leading to generally faster movements. Restore after.
    // Coverage:
    //   MOVEMENT_LEAD_IN / LEAD_OUT  - approach and departure passes
    //   MOVEMENT_LINK_DIRECT         - direct (non-cutting) linking moves
    //   MOVEMENT_LINK_TRANSITION     - linking moves between adjacent passes (stay-down in adaptive)
    //   MOVEMENT_HIGH_FEED           - mapped rapid moves between cuts
    if (movement == MOVEMENT_LEAD_IN || movement == MOVEMENT_LEAD_OUT ||
        movement == MOVEMENT_LINK_DIRECT || movement == MOVEMENT_LINK_TRANSITION ||
        movement == MOVEMENT_HIGH_FEED) {
      if (smoothing.isActive) {
        writeComment("Force smoothing off");
      }
      setSmoothing(false);
    } else {
      setSmoothing(smoothing.isAllowed);
    }
  }
}

function onParameter(name, value) {
  switch (name) {
  case "job-description":
    // Record updated param so that we can print it in the section break
    jobDescription = value
    break;
  case "job-notes":
    // Don't output on the very first section, handled by onStart()
    if (!firstNote && getProperty("showNotes") ) {
      // FIXME: This assumes that job-description gets set before job-notes
      writeln("");
      writeNotes("Setup. " + jobDescription);
      writeNotes(value);
    }
    firstNote = false;
    break;
  case "action":
    onAction(value);
    break;
  default:
    break;
  }
}

// OWG v3_4: Updated onAction to handle standalone action commands (e.g. laser_wear, measure_wear)
// as well as colon-separated commands (e.g. ROTATE_WCS:TRUE)
function onAction(action) {
  var invalid = false;
  var sText1 = String(action).toUpperCase().trim();

  // Check for standalone in-cycle laser wear actions (laser_wear or measure_wear)
  if (sText1 == "LASER_WEAR" || sText1 == "MEASURE_WEAR" || sText1.indexOf("LASER_WEAR:") === 0 || sText1.indexOf("MEASURE_WEAR:") === 0) {
    var activeTool = (typeof tool != "undefined" && tool) ? tool : (typeof currentSection != "undefined" && currentSection ? currentSection.getTool() : undefined);
    if (!activeTool) {
      error(localize("No active tool found for laser wear measurement action: ") + action);
      return;
    }
    writeln("");
    writeComment("MANUAL ACTION: IN-CYCLE LASER WEAR MEASUREMENT");
    writeLaserWearBlock(activeTool, false);
    setCoolant(activeTool.coolant);
    startSpindle(activeTool, true);
    return;
  }

  // Check for standalone in-cycle tool length actions (laser_length or measure_length)
  if (sText1 == "LASER_LENGTH" || sText1 == "MEASURE_LENGTH" || sText1.indexOf("LASER_LENGTH:") === 0 || sText1.indexOf("MEASURE_LENGTH:") === 0) {
    var activeTool = (typeof tool != "undefined" && tool) ? tool : (typeof currentSection != "undefined" && currentSection ? currentSection.getTool() : undefined);
    if (!activeTool) {
      error(localize("No active tool found for tool measurement action: ") + action);
      return;
    }
    writeln("");
    writeComment("MANUAL ACTION: IN-CYCLE TOOL LENGTH MEASUREMENT");
    writeToolMeasureBlock(activeTool, false);
    setCoolant(activeTool.coolant);
    startSpindle(activeTool, true);
    return;
  }

  /* OWG v3_3 original action parsing commented out for v3_4 upgrade
  var sText2 = new Array();
  sText2 = sText1.split(":");
  if (sText2.length != 2) {
    error(localize("Invalid action command: ") + action);
    return;
  }
  var param = sText2[1];
  writeln("");

  switch (sText2[0]) {
  */

  var sText2 = sText1.split(":");
  if (sText2.length != 2) {
    error(localize("Invalid action command: ") + action);
    return;
  }
  var param = sText2[1];
  writeln("");

  switch (sText2[0]) {
  case "ROTATE_WCS":
    param = parseChoice(param, "YES", "NO", "TRUE", "FALSE");
    if (param == undefined) {
      error(localize("Invalid ROTATE_WCS param. Use TRUE/FALSE"));
      return;
    } else if (param) {
      // Enable WCS rotation.
      writeComment("ENABLE WCS ROTATION. ENSURE ROTATION PARAM UPDATED BEFORE THIS LINE")
      setProbeAngleMethod();
      if (probeVariables.compensationXY == undefined) {
        probeVariables.compensationXY = "X" + xyzFormat.format(0) + " Y" + xyzFormat.format(0);
      }
    } else {
      writeComment("DISABLE WCS ROTATION")
      probeVariables.outputRotationCodes = false;
      cancelWorkPlane();
    };
    break;
  default:
    error(localize("Invalid action parameter: ") + sText2[0] + ":" + param);
    return;
  }
}

/* returns the choice specified in a text string compared to a list of choices */
function parseChoice() {
  var stat = undefined;
  for (i = 1; i < arguments.length; i++) {
    if (String(arguments[0]).toUpperCase() == String(arguments[i]).toUpperCase()) {
      if ((String(arguments[i]).toUpperCase() == "YES") || (String(arguments[i]).toUpperCase() == "TRUE")) {
        stat = true;
      } else if ((String(arguments[i]).toUpperCase() == "NO") || (String(arguments[i]).toUpperCase() == "FALSE")) {
        stat = false;
      } else {
        stat = i - 1;
        break;
      }
    }
  }
  return stat;
}

function writeStock() {
  if (hasGlobalParameter("stock")) {
    var stock = getGlobalParameter("stock");
    var x = xyzFormat.format(getGlobalParameter("stock-upper-x") - getGlobalParameter("stock-lower-x"));
    var y = xyzFormat.format(getGlobalParameter("stock-upper-y") - getGlobalParameter("stock-lower-y"));
    var z = xyzFormat.format(getGlobalParameter("stock-upper-z") - getGlobalParameter("stock-lower-z"));
    writeComment("Stock Size")
    writeComment("X" + x + " Y" + y + " Z" + z);
    writeln("");
    writeComment("WCS Location")
    writeComment("X Min " + xyzFormat.format(getGlobalParameter("stock-lower-x")) + " Max " + xyzFormat.format(getGlobalParameter("stock-upper-x")));
    writeComment("Y Min " + xyzFormat.format(getGlobalParameter("stock-lower-y")) + " Max " + xyzFormat.format(getGlobalParameter("stock-upper-y")));
    writeComment("Z Min " + xyzFormat.format(getGlobalParameter("stock-lower-z")) + " Max " + xyzFormat.format(getGlobalParameter("stock-upper-z")));
    writeln("");
  }
}

// Format and write a multiline text string as a comment
function writeNotes(text) {
  if (text) {
    var lines = String(text).split("\n");
    var r1 = new RegExp("^[\\s]+", "g");
    var r2 = new RegExp("[\\s]+$", "g");
    for (line in lines) {
      var comment = lines[line].replace(r1, "").replace(r2, "");
      if (comment) {
        writeComment(comment);
      }
    }
  }
}

// >>>>> INCLUDED FROM include_files/commonFunctions.cpi
// internal variables, do not change
var receivedMachineConfiguration;
var tcp = {isSupportedByControl:getSetting("supportsTCP", true), isSupportedByMachine:false, isSupportedByOperation:false};
var state = {
  retractedX              : false, // specifies that the machine has been retracted in X
  retractedY              : false, // specifies that the machine has been retracted in Y
  retractedZ              : false, // specifies that the machine has been retracted in Z
  tcpIsActive             : false, // specifies that TCP is currently active
  twpIsActive             : false, // specifies that TWP is currently active
  lengthCompensationActive: !getSetting("outputToolLengthCompensation", true), // specifies that tool length compensation is active
  mainState               : true // specifies the current context of the state (true = main, false = optional)
};
var validateLengthCompensation = getSetting("outputToolLengthCompensation", true); // disable validation when outputToolLengthCompensation is disabled
var multiAxisFeedrate;
var sequenceNumber;
var optionalSection = false;
var currentWorkOffset;
var forceSpindleSpeed = false;
var operationNeedsSafeStart = false; // used to convert blocks to optional for safeStartAllOperations

function activateMachine() {
  // disable unsupported rotary axes output
  if (!machineConfiguration.isMachineCoordinate(0) && (typeof aOutput != "undefined")) {
    aOutput.disable();
  }
  if (!machineConfiguration.isMachineCoordinate(1) && (typeof bOutput != "undefined")) {
    bOutput.disable();
  }
  if (!machineConfiguration.isMachineCoordinate(2) && (typeof cOutput != "undefined")) {
    cOutput.disable();
  }

  // setup usage of useTiltedWorkplane
  settings.workPlaneMethod.useTiltedWorkplane = getProperty("useTiltedWorkplane") != undefined ? getProperty("useTiltedWorkplane") :
    getSetting("workPlaneMethod.useTiltedWorkplane", false);
  settings.workPlaneMethod.useABCPrepositioning = getSetting("workPlaneMethod.useABCPrepositioning", true);

  if (!machineConfiguration.isMultiAxisConfiguration()) {
    return; // don't need to modify any settings for 3-axis machines
  }

  // identify if any of the rotary axes has TCP enabled
  var axes = [machineConfiguration.getAxisU(), machineConfiguration.getAxisV(), machineConfiguration.getAxisW()];
  tcp.isSupportedByMachine = axes.some(function(axis) {return axis.isEnabled() && axis.isTCPEnabled();}); // true if TCP is enabled on any rotary axis
  if (tcp.isSupportedByMachine) {
    bufferRotaryMoves = false; // disable bufferRotaryMoves if TCP is enabled on any rotary axis
  }

  // save multi-axis feedrate settings from machine configuration
  var mode = machineConfiguration.getMultiAxisFeedrateMode();
  var type = mode == FEED_INVERSE_TIME ? machineConfiguration.getMultiAxisFeedrateInverseTimeUnits() :
    (mode == FEED_DPM ? machineConfiguration.getMultiAxisFeedrateDPMType() : DPM_STANDARD);
  multiAxisFeedrate = {
    mode     : mode,
    maximum  : machineConfiguration.getMultiAxisFeedrateMaximum(),
    type     : type,
    tolerance: mode == FEED_DPM ? machineConfiguration.getMultiAxisFeedrateOutputTolerance() : 0,
    bpwRatio : mode == FEED_DPM ? machineConfiguration.getMultiAxisFeedrateBpwRatio() : 1
  };

  // setup of retract/reconfigure  TAG: Only needed until post kernel supports these machine config settings
  if (receivedMachineConfiguration && machineConfiguration.performRewinds()) {
    safeRetractDistance = machineConfiguration.getSafeRetractDistance();
    safePlungeFeed = machineConfiguration.getSafePlungeFeedrate();
    safeRetractFeed = machineConfiguration.getSafeRetractFeedrate();
  }
  if (typeof safeRetractDistance == "number" && getProperty("safeRetractDistance") != undefined && getProperty("safeRetractDistance") != 0) {
    safeRetractDistance = getProperty("safeRetractDistance");
  }

  if (revision >= 50294) {
    activateAutoPolarMode({tolerance:tolerance / 2, optimizeType:OPTIMIZE_AXIS, expandCycles:getSetting("polarCycleExpandMode", EXPAND_ALL)});
  }

  if (machineConfiguration.isHeadConfiguration() && getSetting("workPlaneMethod.compensateToolLength", false)) {
    for (var i = 0; i < getNumberOfSections(); ++i) {
      var section = getSection(i);
      if (section.isMultiAxis()) {
        machineConfiguration.setToolLength(getBodyLength(section.getTool())); // define the tool length for head adjustments
        section.optimizeMachineAnglesByMachine(machineConfiguration, OPTIMIZE_AXIS);
      }
    }
  } else {
    optimizeMachineAngles2(OPTIMIZE_AXIS);
  }
}

function getBodyLength(tool) {
  for (var i = 0; i < getNumberOfSections(); ++i) {
    var section = getSection(i);
    if (tool.number == section.getTool().number) {
      if (section.hasParameter("operation:tool_assemblyGaugeLength")) { // For Fusion
        return section.getParameter("operation:tool_assemblyGaugeLength", tool.bodyLength + tool.holderLength);
      } else { // Legacy products
        return section.getParameter("operation:tool_overallLength", tool.bodyLength + tool.holderLength);
      }
    }
  }
  return tool.bodyLength + tool.holderLength;
}

function getFeed(f) {
  if (getProperty("useG95")) {
    return feedOutput.format(f / spindleSpeed); // use feed value
  }
  if (typeof activeMovements != "undefined" && activeMovements) {
    var feedContext = activeMovements[movement];
    if (feedContext != undefined) {
      if (!feedFormat.areDifferent(feedContext.feed, f)) {
        if (feedContext.id == currentFeedId) {
          return ""; // nothing has changed
        }
        forceFeed();
        currentFeedId = feedContext.id;
        return settings.parametricFeeds.feedOutputVariable + (settings.parametricFeeds.firstFeedParameter + feedContext.id);
      }
    }
    currentFeedId = undefined; // force parametric feed next time
  }
  return feedOutput.format(f); // use feed value
}

function validateCommonParameters() {
  validateToolData();
  for (var i = 0; i < getNumberOfSections(); ++i) {
    var section = getSection(i);
    if (getSection(0).workOffset == 0 && section.workOffset > 0) {
      if (!(typeof wcsDefinitions != "undefined" && wcsDefinitions.useZeroOffset)) {
        error(localize("Using multiple work offsets is not possible if the initial work offset is 0."));
      }
    }
    if (section.isMultiAxis()) {
      if (!section.isOptimizedForMachine() &&
        (!getSetting("workPlaneMethod.useTiltedWorkplane", false) || !getSetting("supportsToolVectorOutput", false))) {
        error(localize("This postprocessor requires a machine configuration for 5-axis simultaneous toolpath."));
      }
      if (machineConfiguration.getMultiAxisFeedrateMode() == FEED_INVERSE_TIME && !getSetting("supportsInverseTimeFeed", true)) {
        error(localize("This postprocessor does not support inverse time feedrates."));
      }
      if (getSetting("supportsToolVectorOutput", false) && !tcp.isSupportedByControl) {
        error(localize("Incompatible postprocessor settings detected." + EOL +
        "Setting 'supportsToolVectorOutput' requires setting 'supportsTCP' to be enabled as well."));
      }
    }
  }
  if (!tcp.isSupportedByControl && tcp.isSupportedByMachine) {
    error(localize("The machine configuration has TCP enabled which is not supported by this postprocessor."));
  }
  if (getProperty("safePositionMethod") == "clearanceHeight") {
    var msg = "-Attention- Property 'Safe Retracts' is set to 'Clearance Height'." + EOL +
      "Ensure the clearance height will clear the part and or fixtures." + EOL +
      "Raise the Z-axis to a safe height before starting the program.";
    warning(msg);
    writeComment(msg);
  }
}

function validateToolData() {
  var _default = 99999;
  var _maximumSpindleRPM = machineConfiguration.getMaximumSpindleSpeed() > 0 ? machineConfiguration.getMaximumSpindleSpeed() :
    settings.maximumSpindleRPM == undefined ? _default : settings.maximumSpindleRPM;
  var _maximumToolNumber = machineConfiguration.isReceived() && machineConfiguration.getNumberOfTools() > 0 ? machineConfiguration.getNumberOfTools() :
    settings.maximumToolNumber == undefined ? _default : settings.maximumToolNumber;
  var _maximumToolLengthOffset = settings.maximumToolLengthOffset == undefined ? _default : settings.maximumToolLengthOffset;
  var _maximumToolDiameterOffset = settings.maximumToolDiameterOffset == undefined ? _default : settings.maximumToolDiameterOffset;

  var header = ["Detected maximum values are out of range.", "Maximum values:"];
  var warnings = {
    toolNumber    : {msg:"Tool number value exceeds the maximum value for tool: " + EOL, max:" Tool number: " + _maximumToolNumber, values:[]},
    lengthOffset  : {msg:"Tool length offset value exceeds the maximum value for tool: " + EOL, max:" Tool length offset: " + _maximumToolLengthOffset, values:[]},
    diameterOffset: {msg:"Tool diameter offset value exceeds the maximum value for tool: " + EOL, max:" Tool diameter offset: " + _maximumToolDiameterOffset, values:[]},
    spindleSpeed  : {msg:"Spindle speed exceeds the maximum value for operation: " + EOL, max:" Spindle speed: " + _maximumSpindleRPM, values:[]}
  };

  var toolIds = [];
  for (var i = 0; i < getNumberOfSections(); ++i) {
    var section = getSection(i);
    if (toolIds.indexOf(section.getTool().getToolId()) === -1) { // loops only through sections which have a different tool ID
      var toolNumber = section.getTool().number;
      var lengthOffset = section.getTool().lengthOffset;
      var diameterOffset = section.getTool().diameterOffset;
      var comment = section.getParameter("operation-comment", "");

      if (toolNumber > _maximumToolNumber && !getProperty("toolAsName")) {
        warnings.toolNumber.values.push(SP + toolNumber + EOL);
      }
      if (lengthOffset > _maximumToolLengthOffset) {
        warnings.lengthOffset.values.push(SP + "Tool " + toolNumber + " (" + comment + "," + " Length offset: " + lengthOffset + ")" + EOL);
      }
      if (diameterOffset > _maximumToolDiameterOffset) {
        warnings.diameterOffset.values.push(SP + "Tool " + toolNumber + " (" + comment + "," + " Diameter offset: " + diameterOffset + ")" + EOL);
      }
      toolIds.push(section.getTool().getToolId());
    }
    // loop through all sections regardless of tool id for idenitfying spindle speeds

    // identify if movement ramp is used in current toolpath, use ramp spindle speed for comparisons
    var ramp = section.getMovements() & ((1 << MOVEMENT_RAMP) | (1 << MOVEMENT_RAMP_ZIG_ZAG) | (1 << MOVEMENT_RAMP_PROFILE) | (1 << MOVEMENT_RAMP_HELIX));
    var _sectionSpindleSpeed = Math.max(section.getTool().spindleRPM, ramp ? section.getTool().rampingSpindleRPM : 0, 0);
    if (_sectionSpindleSpeed > _maximumSpindleRPM) {
      warnings.spindleSpeed.values.push(SP + section.getParameter("operation-comment", "") + " (" + _sectionSpindleSpeed + " RPM" + ")" + EOL);
    }
  }

  // sort lists by tool number
  warnings.toolNumber.values.sort(function(a, b) {return a - b;});
  warnings.lengthOffset.values.sort(function(a, b) {return a.localeCompare(b);});
  warnings.diameterOffset.values.sort(function(a, b) {return a.localeCompare(b);});

  var warningMessages = [];
  for (var key in warnings) {
    if (warnings[key].values != "") {
      header.push(warnings[key].max); // add affected max values to the header
      warningMessages.push(warnings[key].msg + warnings[key].values.join(""));
    }
  }
  if (warningMessages.length != 0) {
    warningMessages.unshift(header.join(EOL) + EOL);
    warning(warningMessages.join(EOL));
  }
}

function forceFeed() {
  currentFeedId = undefined;
  feedOutput.reset();
}

/** Force output of X, Y, and Z. */
function forceXYZ() {
  xOutput.reset();
  yOutput.reset();
  zOutput.reset();
}

/** Force output of A, B, and C. */
function forceABC() {
  aOutput.reset();
  bOutput.reset();
  cOutput.reset();
}

/** Force output of X, Y, Z, A, B, C, and F on next output. */
function forceAny() {
  forceXYZ();
  forceABC();
  forceFeed();
}

function prepareForToolCheck() {
  // OWG v3_7: refuse when a G68 probe rotation would be destroyed by the Blum cycle
  validateToolCheckAllowed();
  // OWG v3_5: Enforce spindle retraction to machine reference (G28/G53) prior to tool check
  // Eliminates hazard of Brother SM4054 and prevents rapid moves toward laser while in workpiece
  if (!state.retractedZ) {
    writeRetract(Z);
  }
  setCoolant(COOLANT_OFF);
  onCommand(COMMAND_STOP_SPINDLE);
}

/**
  Writes the specified block.
*/
function writeBlock() {
  var text = formatWords(arguments);
  if (!text) {
    return;
  }
  var prefix = getSetting("sequenceNumberPrefix", "N");
  var suffix = getSetting("writeBlockSuffix", "");
  if ((optionalSection || skipBlocks) && !getSetting("supportsOptionalBlocks", true)) {
    error(localize("Optional blocks are not supported by this post."));
  }
  if (getProperty("showSequenceNumbers") == "true") {
    if (sequenceNumber == undefined || sequenceNumber >= settings.maximumSequenceNumber) {
      sequenceNumber = getProperty("sequenceNumberStart");
    }
    if (optionalSection || skipBlocks) {
      writeWords2("/", prefix + sequenceNumber, text + suffix);
    } else {
      writeWords2(prefix + sequenceNumber, text + suffix);
    }
    sequenceNumber += getProperty("sequenceNumberIncrement");
  } else {
    if (optionalSection || skipBlocks) {
      writeWords2("/", text + suffix);
    } else {
      writeWords(text + suffix);
    }
  }
}

validate(settings.comments, "Setting 'comments' is required but not defined.");
function formatComment(text) {
  if (!text) {
    return "";
  }
  var prefix = settings.comments.prefix;
  var suffix = settings.comments.suffix;
  var _permittedCommentChars = settings.comments.permittedCommentChars == undefined ? "" : settings.comments.permittedCommentChars;
  switch (settings.comments.outputFormat) {
  case "upperCase":
    text = text.toUpperCase();
    _permittedCommentChars = _permittedCommentChars.toUpperCase();
    break;
  case "lowerCase":
    text = text.toLowerCase();
    _permittedCommentChars = _permittedCommentChars.toLowerCase();
    break;
  case "ignoreCase":
    _permittedCommentChars = _permittedCommentChars.toUpperCase() + _permittedCommentChars.toLowerCase();
    break;
  default:
    error(localize("Unsupported option specified for setting 'comments.outputFormat'."));
  }
  if (_permittedCommentChars != "") {
    text = filterText(String(text), _permittedCommentChars);
  }
  text = String(text).substring(0, settings.comments.maximumLineLength - prefix.length - suffix.length);
  return text != "" ? prefix + text + suffix : "";
}

/**
  Output a comment.
*/
function writeComment(text) {
  if (!text) {
    return;
  }
  var comments = String(text).split(/\r?\n/);
  for (comment in comments) {
    var _comment = formatComment(comments[comment]);
    if (_comment) {
      if (getSetting("comments.showSequenceNumbers", false)) {
        writeBlock(_comment);
      } else {
        writeln(_comment);
      }
    }
  }
}

function onComment(text) {
  writeComment(text);
}

/**
  Writes the specified block - used for tool changes only.
*/
function writeToolBlock() {
  var show = getProperty("showSequenceNumbers");
  setProperty("showSequenceNumbers", (show == "true" || show == "toolChange") ? "true" : "false");
  writeBlock(arguments);
  setProperty("showSequenceNumbers", show);
  machineSimulation({/*x:toPreciseUnit(200, MM), y:toPreciseUnit(200, MM), coordinates:MACHINE,*/ mode:TOOLCHANGE}); // move machineSimulation to a tool change position
}

var skipBlocks = false;
var initialState = JSON.parse(JSON.stringify(state)); // save initial state
var optionalState = JSON.parse(JSON.stringify(state));
var saveCurrentSectionId = undefined;
function writeStartBlocks(isRequired, code) {
  var saveSkipBlocks = skipBlocks;
  var saveMainState = state; // save main state

  if (!isRequired) {
    if (!getProperty("safeStartAllOperations", false)) {
      return; // when safeStartAllOperations is disabled, dont output code and return
    }
    if (saveCurrentSectionId != getCurrentSectionId()) {
      saveCurrentSectionId = getCurrentSectionId();
      forceModals(); // force all modal variables when entering a new section
      optionalState = Object.create(initialState); // reset optionalState to initialState when entering a new section
    }
    skipBlocks = true; // if values are not required, but safeStartAllOperations is enabled - write following blocks as optional
    state = optionalState; // set state to optionalState if skipBlocks is true
    state.mainState = false;
  }
  code(); // writes out the code which is passed to this function as an argument

  state = saveMainState; // restore main state
  skipBlocks = saveSkipBlocks; // restore skipBlocks value
}

var pendingRadiusCompensation = -1;
function onRadiusCompensation() {
  pendingRadiusCompensation = radiusCompensation;
  if (pendingRadiusCompensation >= 0 && !getSetting("supportsRadiusCompensation", true)) {
    error(localize("Radius compensation mode is not supported."));
    return;
  }
}

function onPassThrough(text) {
  writeln("");
  writeComment("Manual NC Passthrough");
  var commands = String(text).split(",");
  for (text in commands) {
    writeBlock(commands[text]);
  }
}

function forceModals() {
  if (arguments.length == 0) { // reset all modal variables listed below
    var modals = [
      "gMotionModal",
      "gPlaneModal",
      "gAbsIncModal",
      "gFeedModeModal",
      "feedOutput"
    ];
    if (operationNeedsSafeStart && (typeof currentSection != "undefined" && currentSection.isMultiAxis())) {
      modals.push("fourthAxisClamp", "fifthAxisClamp", "sixthAxisClamp");
    }
    for (var i = 0; i < modals.length; ++i) {
      if (typeof this[modals[i]] != "undefined") {
        this[modals[i]].reset();
      }
    }
  } else {
    for (var i in arguments) {
      arguments[i].reset(); // only reset the modal variable passed to this function
    }
  }
}

/** Helper function to be able to use a default value for settings which do not exist. */
function getSetting(setting, defaultValue) {
  var result = defaultValue;
  var keys = setting.split(".");
  var obj = settings;
  for (var i in keys) {
    if (obj[keys[i]] != undefined) { // setting does exist
      result = obj[keys[i]];
      if (typeof [keys[i]] === "object") {
        obj = obj[keys[i]];
        continue;
      }
    } else { // setting does not exist, use default value
      if (defaultValue != undefined) {
        result = defaultValue;
      } else {
        error("Setting '" + keys[i] + "' has no default value and/or does not exist.");
        return undefined;
      }
    }
  }
  return result;
}

function getForwardDirection(_section) {
  var forward = undefined;
  var _optimizeType = settings.workPlaneMethod && settings.workPlaneMethod.optimizeType;
  if (_section.isMultiAxis()) {
    forward = _section.workPlane.forward;
  } else if (!getSetting("workPlaneMethod.useTiltedWorkplane", false) && machineConfiguration.isMultiAxisConfiguration()) {
    if (_optimizeType == undefined) {
      var saveRotation = getRotation();
      getWorkPlaneMachineABC(_section, true);
      forward = getRotation().forward;
      setRotation(saveRotation); // reset rotation
    } else {
      var abc = getWorkPlaneMachineABC(_section, false);
      var forceAdjustment = settings.workPlaneMethod.optimizeType == OPTIMIZE_TABLES || settings.workPlaneMethod.optimizeType == OPTIMIZE_BOTH;
      forward = machineConfiguration.getOptimizedDirection(_section.workPlane.forward, abc, false, forceAdjustment);
    }
  } else {
    forward = getRotation().forward;
  }
  return forward;
}

function getRetractParameters() {
  var _arguments = typeof arguments[0] === "object" ? arguments[0].axes : arguments;
  var singleLine = arguments[0].singleLine == undefined ? true : arguments[0].singleLine;
  var words = []; // store all retracted axes in an array
  var retractAxes = new Array(false, false, false);
  var method = getProperty("safePositionMethod", "undefined");
  if (method == "clearanceHeight") {
    // if (!is3D()) {
    //   error(localize("Safe retract option 'Clearance Height' is only supported when all operations are along the setup Z-axis."));
    // }
    return undefined;
  }
  validate(settings.retract, "Setting 'retract' is required but not defined.");
  validate(_arguments.length != 0, "No axis specified for getRetractParameters().");
  for (i in _arguments) {
    retractAxes[_arguments[i]] = true;
  }
  if ((retractAxes[0] || retractAxes[1]) && !state.retractedZ) { // retract Z first before moving to X/Y home
    error(localize("Retracting in X/Y is not possible without being retracted in Z."));
    return undefined;
  }
  // special conditions
  if (retractAxes[0] || retractAxes[1]) {
    method = getSetting("retract.methodXY", method);
  }
  if (retractAxes[2]) {
    method = getSetting("retract.methodZ", method);
  }
  // define home positions
  var useZeroValues = (settings.retract.useZeroValues && settings.retract.useZeroValues.indexOf(method) != -1);
  var _xHome;          // string used in the emitted G53/G28 block (may be a Brother macro expression)
  var _xHomeForSim;    // numeric value used by machineSimulation, which can't evaluate macros
  if (getProperty("positionAtEnd") == "home") {
    var tempX = machineConfiguration.hasHomePositionX() && !useZeroValues ? machineConfiguration.getHomePositionX() : toPreciseUnit(0, MM);
    _xHome = xyzFormat.format(tempX);
    _xHomeForSim = tempX;
  } else if (getProperty("positionAtEnd") == "centerAtDoor" && hasParameter("part-upper-x") && hasParameter("part-lower-x")) {
    var bOpen = String.fromCharCode(91);
    var bClose = String.fromCharCode(93);
    var partCenterX = (getParameter("part-upper-x") + getParameter("part-lower-x")) / 2;
    // Format the ABSOLUTE value, then choose the sign separately. This avoids a
    // float-precision bug: for a symmetric part where part-upper-x and part-lower-x
    // should sum to exactly zero, the actual sum can be tiny-negative (e.g. -1.78e-15)
    // due to floating-point. Without this care, the sign would be "" (because <0) but
    // xyzFormat.format() would round to "0" (losing the minus), producing the invalid
    // output "[#5021-#50410]" - one continuous illegal macro variable. Always-explicit
    // "+"/"-" plus an absolute-value format keeps the output well-formed.
    var formattedAbsCenter = xyzFormat.format(Math.abs(partCenterX));
    var sign = (partCenterX < 0 && formattedAbsCenter !== "0" && formattedAbsCenter !== "0.0000") ? "-" : "+";
    _xHome = bOpen + "#5021-#5041" + sign + formattedAbsCenter + bClose;
    // For simulation, fall back to 0 since we can't resolve the runtime macro here.
    _xHomeForSim = toPreciseUnit(0, MM);
  } else {
    _xHome = xyzFormat.format(toPreciseUnit(0, MM));
    _xHomeForSim = toPreciseUnit(0, MM);
  }

  var _yHome = machineConfiguration.hasHomePositionY() && !useZeroValues ? machineConfiguration.getHomePositionY() : toPreciseUnit(0, MM);
  var _zHome = machineConfiguration.getRetractPlane() != 0 && !useZeroValues ? machineConfiguration.getRetractPlane() : toPreciseUnit(0, MM);
  for (var i = 0; i < _arguments.length; ++i) {
    switch (_arguments[i]) {
    case X:
      if (!state.retractedX) {
        words.push("X" + _xHome); // Formatted dynamically above
        xOutput.reset();
        state.retractedX = true;
      }
      break;
    case Y:
      if (!state.retractedY) {
        words.push("Y" + xyzFormat.format(_yHome));
        yOutput.reset();
        state.retractedY = true;
      }
      break;
    case Z:
      if (!state.retractedZ) {
        words.push("Z" + xyzFormat.format(_zHome));
        zOutput.reset();
        state.retractedZ = true;
      }
      break;
    default:
      error(localize("Unsupported axis specified for getRetractParameters()."));
      return undefined;
    }
  }
  return {
    method     : method,
    retractAxes: retractAxes,
    words      : words,
    positions  : {
      x: retractAxes[0] ? _xHomeForSim : undefined,
      y: retractAxes[1] ? _yHome : undefined,
      z: retractAxes[2] ? _zHome : undefined},
    singleLine: singleLine};
}

/** Returns true when subprogram logic does exist into the post. */
function subprogramsAreSupported() {
  return typeof subprogramState != "undefined";
}

// Start of machine simulation connection move support
var debugSimulation = false; // enable to output debug information for connection move support in the NC program
var TCPON = "TCP ON";
var TCPOFF = "TCP OFF";
var TWPON = "TWP ON";
var TWPOFF = "TWP OFF";
var TOOLCHANGE = "TOOL CHANGE";
var RETRACTTOOLAXIS = "RETRACT TOOLAXIS";
var WORK = "WORK CS";
var MACHINE = "MACHINE CS";
var MIN = "MIN";
var MAX = "MAX";
var WARNING_NON_RANGE = [0, 1, 2];
var isTwpOn;
var isTcpOn;
/**
 * Helper function for connection moves in machine simulation.
 * @param {Object} parameters An object containing the desired options for machine simulation.
 * @note Available properties are:
 * @param {Number} x X axis position, alternatively use MIN or MAX to move to the axis limit
 * @param {Number} y Y axis position, alternatively use MIN or MAX to move to the axis limit
 * @param {Number} z Z axis position, alternatively use MIN or MAX to move to the axis limit
 * @param {Number} a A axis position (in radians)
 * @param {Number} b B axis position (in radians)
 * @param {Number} c C axis position (in radians)
 * @param {Number} feed desired feedrate, automatically set to high/current feedrate if not specified
 * @param {String} mode mode TCPON | TCPOFF | TWPON | TWPOFF | TOOLCHANGE | RETRACTTOOLAXIS
 * @param {String} coordinates WORK | MACHINE - if undefined, work coordinates will be used by default
 * @param {Number} eulerAngles the calculated Euler angles for the workplane
 * @example
  machineSimulation({a:abc.x, b:abc.y, c:abc.z, coordinates:MACHINE});
  machineSimulation({x:toPreciseUnit(200, MM), y:toPreciseUnit(200, MM), coordinates:MACHINE, mode:TOOLCHANGE});
*/
function machineSimulation(parameters) {
  if (revision < 50198 || skipBlocks || (getSimulationStreamPath() == "" && !debugSimulation)) {
    return; // return when post kernel revision is lower than 50198 or when skipBlocks is enabled
  }
  getAxisLimit = function(axis, limit) {
    validate(limit == MIN || limit == MAX, subst(localize("Invalid argument \"%1\" passed to the machineSimulation function."), limit));
    var range = axis.getRange();
    if (range.isNonRange()) {
      var axisLetters = ["X", "Y", "Z"];
      var warningMessage = subst(localize("An attempt was made to move the \"%1\" axis to its MIN/MAX limits during machine simulation, but its range is set to \"unlimited\"." + EOL +
        "A limited range must be set for the \"%1\" axis in the machine definition, or these motions will not be shown in machine simulation."), axisLetters[axis.getCoordinate()]);
      warningOnce(warningMessage, WARNING_NON_RANGE[axis.getCoordinate()]);
      return undefined;
    }
    return limit == MIN ? range.minimum : range.maximum;
  };
  var x = (isNaN(parameters.x) && parameters.x) ? getAxisLimit(machineConfiguration.getAxisX(), parameters.x) : parameters.x;
  var y = (isNaN(parameters.y) && parameters.y) ? getAxisLimit(machineConfiguration.getAxisY(), parameters.y) : parameters.y;
  var z = (isNaN(parameters.z) && parameters.z) ? getAxisLimit(machineConfiguration.getAxisZ(), parameters.z) : parameters.z;
  var rotaryAxesErrorMessage = localize("Invalid argument for rotary axes passed to the machineSimulation function. Only numerical values are supported.");
  var a = (isNaN(parameters.a) && parameters.a) ? error(rotaryAxesErrorMessage) : parameters.a;
  var b = (isNaN(parameters.b) && parameters.b) ? error(rotaryAxesErrorMessage) : parameters.b;
  var c = (isNaN(parameters.c) && parameters.c) ? error(rotaryAxesErrorMessage) : parameters.c;
  var coordinates = parameters.coordinates;
  var eulerAngles = parameters.eulerAngles;
  var feed = parameters.feed;
  if (feed === undefined && typeof gMotionModal !== "undefined") {
    feed = gMotionModal.getCurrent() !== 0;
  }
  var mode = parameters.mode;
  var performToolChange = mode == TOOLCHANGE;
  if (mode !== undefined && ![TCPON, TCPOFF, TWPON, TWPOFF, TOOLCHANGE, RETRACTTOOLAXIS].includes(mode)) {
    error(subst("Mode '%1' is not supported.", mode));
  }

  // mode takes precedence over TCP/TWP states
  var enableTCP = isTcpOn;
  var enableTWP = isTwpOn;
  if (mode === TCPON || mode === TCPOFF) {
    enableTCP = mode === TCPON;
  } else if (mode === TWPON || mode === TWPOFF) {
    enableTWP = mode === TWPON;
  } else {
    enableTCP = typeof state !== "undefined" && state.tcpIsActive;
    enableTWP = typeof state !== "undefined" && state.twpIsActive;
  }
  var disableTCP = !enableTCP;
  var disableTWP = !enableTWP;
  if (disableTWP) {
    simulation.setTWPModeOff();
    isTwpOn = false;
  }
  if (disableTCP) {
    simulation.setTCPModeOff();
    isTcpOn = false;
  }
  if (enableTCP) {
    simulation.setTCPModeOn();
    isTcpOn = true;
  }
  if (enableTWP) {
    if (settings.workPlaneMethod.eulerConvention == undefined) {
      simulation.setTWPModeAlignToCurrentPose();
    } else if (eulerAngles) {
      simulation.setTWPModeByEulerAngles(settings.workPlaneMethod.eulerConvention, eulerAngles.x, eulerAngles.y, eulerAngles.z);
    }
    isTwpOn = true;
  }
  if (mode == RETRACTTOOLAXIS) {
    simulation.retractAlongToolAxisToLimit();
  }

  if (debugSimulation) {
    writeln("  DEBUG" + JSON.stringify(parameters));
    writeln("  DEBUG" + JSON.stringify({isTwpOn:isTwpOn, isTcpOn:isTcpOn, feed:feed}));
  }

  if (x !== undefined || y !== undefined || z !== undefined || a !== undefined || b !== undefined || c !== undefined) {
    if (x !== undefined) {simulation.setTargetX(x);}
    if (y !== undefined) {simulation.setTargetY(y);}
    if (z !== undefined) {simulation.setTargetZ(z);}
    if (a !== undefined) {simulation.setTargetA(a);}
    if (b !== undefined) {simulation.setTargetB(b);}
    if (c !== undefined) {simulation.setTargetC(c);}

    if (feed != undefined && feed) {
      simulation.setMotionToLinear();
      simulation.setFeedrate(typeof feed == "number" ? feed : feedOutput.getCurrent() == 0 ? highFeedrate : feedOutput.getCurrent());
    } else {
      simulation.setMotionToRapid();
    }

    if (coordinates != undefined && coordinates == MACHINE) {
      simulation.moveToTargetInMachineCoords();
    } else {
      simulation.moveToTargetInWorkCoords();
    }
  }
  if (performToolChange) {
    simulation.performToolChangeCycle();
    simulation.moveToTargetInMachineCoords();
  }
}
// <<<<< INCLUDED FROM include_files/commonFunctions.cpi
// >>>>> INCLUDED FROM include_files/defineWorkPlane.cpi
validate(settings.workPlaneMethod, "Setting 'workPlaneMethod' is required but not defined.");
function defineWorkPlane(_section, _setWorkPlane) {
  var abc = new Vector(0, 0, 0);
  if (settings.workPlaneMethod.forceMultiAxisIndexing || !is3D() || machineConfiguration.isMultiAxisConfiguration()) {
    if (isPolarModeActive()) {
      abc = getCurrentDirection();
    } else if (_section.isMultiAxis()) {
      forceWorkPlane();
      cancelTransformation();
      abc = _section.isOptimizedForMachine() ? _section.getInitialToolAxisABC() : _section.getGlobalInitialToolAxis();
    } else if (settings.workPlaneMethod.useTiltedWorkplane && settings.workPlaneMethod.eulerConvention != undefined) {
      if (settings.workPlaneMethod.eulerCalculationMethod == "machine" && machineConfiguration.isMultiAxisConfiguration()) {
        abc = machineConfiguration.getOrientation(getWorkPlaneMachineABC(_section, true)).getEuler2(settings.workPlaneMethod.eulerConvention);
      } else {
        abc = _section.workPlane.getEuler2(settings.workPlaneMethod.eulerConvention);
      }
    } else {
      abc = getWorkPlaneMachineABC(_section, true);
    }

    if (_setWorkPlane) {
      if (_section.isMultiAxis() || isPolarModeActive()) { // 4-5x simultaneous operations
        cancelWorkPlane();
        if (_section.isOptimizedForMachine()) {
          positionABC(abc, true);
        } else {
          setCurrentDirection(abc);
        }
      } else { // 3x and/or 3+2x operations
        setWorkPlane(abc);
      }
    }
  } else {
    var remaining = _section.workPlane;
    if (!isSameDirection(remaining.forward, new Vector(0, 0, 1))) {
      error(localize("Tool orientation is not supported."));
      return abc;
    }
    setRotation(remaining);
  }
  tcp.isSupportedByOperation = isTCPSupportedByOperation(_section);
  return abc;
}

function isTCPSupportedByOperation(_section) {
  var _tcp = _section.getOptimizedTCPMode() == OPTIMIZE_NONE;
  if (!_section.isMultiAxis() && (settings.workPlaneMethod.useTiltedWorkplane ||
    (machineConfiguration.isMultiAxisConfiguration() && settings.workPlaneMethod.optimizeType != undefined ?
      getWorkPlaneMachineABC(_section, false).isZero() : isSameDirection(machineConfiguration.getSpindleAxis(), getForwardDirection(_section))) ||
    settings.workPlaneMethod.optimizeType == OPTIMIZE_HEADS ||
    settings.workPlaneMethod.optimizeType == OPTIMIZE_TABLES ||
    settings.workPlaneMethod.optimizeType == OPTIMIZE_BOTH)) {
    _tcp = false;
  }
  return _tcp;
}
// <<<<< INCLUDED FROM include_files/defineWorkPlane.cpi
// >>>>> INCLUDED FROM include_files/getWorkPlaneMachineABC.cpi
validate(settings.machineAngles, "Setting 'machineAngles' is required but not defined.");
function getWorkPlaneMachineABC(_section, rotate) {
  var currentABC = isFirstSection() ? new Vector(0, 0, 0) : getCurrentABC();
  var abc = _section.getABCByPreference(machineConfiguration, _section.workPlane, currentABC, settings.machineAngles.controllingAxis, settings.machineAngles.type, settings.machineAngles.options);
  if (!isSameDirection(machineConfiguration.getDirection(abc), _section.workPlane.forward)) {
    error(localize("Orientation not supported."));
  }
  if (rotate) {
    if (settings.workPlaneMethod.optimizeType == undefined || settings.workPlaneMethod.useTiltedWorkplane) { // legacy
      var useTCP = false;
      var R = machineConfiguration.getRemainingOrientation(abc, _section.workPlane);
      setRotation(useTCP ? _section.workPlane : R);
    } else {
      if (!_section.isOptimizedForMachine()) {
        machineConfiguration.setToolLength(getSetting("workPlaneMethod.compensateToolLength", false) ? getBodyLength(_section.getTool()) : 0); // define the tool length for head adjustments
        _section.optimize3DPositionsByMachine(machineConfiguration, abc, settings.workPlaneMethod.optimizeType);
      }
    }
  }
  return abc;
}
// <<<<< INCLUDED FROM include_files/getWorkPlaneMachineABC.cpi
// >>>>> INCLUDED FROM include_files/positionABC.cpi
function positionABC(abc, force) {
  if (!machineConfiguration.isMultiAxisConfiguration()) {
    error("Function 'positionABC' can only be used with multi-axis machine configurations.");
  }
  if (typeof unwindABC == "function") {
    unwindABC(abc);
  }
  if (force) {
    forceABC();
  }
  var a = aOutput.format(abc.x);
  var b = bOutput.format(abc.y);
  var c = cOutput.format(abc.z);
  if (a || b || c) {
    writeRetract(Z);
    if (getSetting("retract.homeXY.onIndexing", false)) {
      writeRetract(settings.retract.homeXY.onIndexing);
    }
    onCommand(COMMAND_UNLOCK_MULTI_AXIS);
    gMotionModal.reset();
    writeBlock(gMotionModal.format(0), a, b, c);
    setCurrentABC(abc); // required for machine simulation
    machineSimulation({a:abc.x, b:abc.y, c:abc.z, coordinates:MACHINE});
  }
}
// <<<<< INCLUDED FROM include_files/positionABC.cpi
// >>>>> INCLUDED FROM include_files/writeWCS.cpi
function writeWCS(section, wcsIsRequired) {
  if (section.workOffset != currentWorkOffset) {
    if (getSetting("workPlaneMethod.cancelTiltFirst", false) && wcsIsRequired) {
      cancelWorkPlane();
    }
    if (typeof forceWorkPlane == "function" && wcsIsRequired) {
      forceWorkPlane();
    }
    writeStartBlocks(wcsIsRequired, function () {
      // section.wcs may contain an embedded newline for compound entries
      // like "G54\nG54.2 P3"; split so each line is its own block (each
      // block then gets its own N-number when sequence numbers are enabled).
      var wcsLines = String(section.wcs).split("\n");
      for (var i = 0; i < wcsLines.length; ++i) {
        if (wcsLines[i].length > 0) {
          writeBlock(wcsLines[i]);
        }
      }
    });
    currentWorkOffset = section.workOffset;
  }
}
// <<<<< INCLUDED FROM include_files/writeWCS.cpi
// >>>>> INCLUDED FROM include_files/writeToolCall.cpi
function writeToolCall(tool, insertToolCall) {
  if (!isFirstSection()) {
    writeStartBlocks(!getProperty("safeStartAllOperations") && insertToolCall, function () {
      writeRetract(Z); // write optional Z retract before tool change if safeStartAllOperations is enabled
    });
  }
  writeStartBlocks(insertToolCall, function () {
    if (getSetting("retract.homeXY.onToolChange", false)) {
      writeRetract(settings.retract.homeXY.onToolChange);
    }
    if (!isFirstSection() && insertToolCall) {
      if (typeof forceWorkPlane == "function") {
        forceWorkPlane();
      }
      if (typeof disableLengthCompensation == "function") {
        disableLengthCompensation(false);
      }
    }

    if (tool.manualToolChange) {
      onCommand(COMMAND_STOP);
      writeComment("MANUAL TOOL CHANGE TO T" + toolFormat.format(tool.number));
      // OWG v3_4: Ensure wear compensation geometry register is cleared at manual tool change
      ensureWearModeZeroComp(tool.number);
    } else {
      if (!isFirstSection() && getProperty("optionalStop") && insertToolCall) {
        onCommand(COMMAND_OPTIONAL_STOP);
      }
      onCommand(COMMAND_LOAD_TOOL);
    }
  });
  if (typeof forceModals == "function" && (insertToolCall || getProperty("safeStartAllOperations"))) {
    forceModals();
  }
}
// <<<<< INCLUDED FROM include_files/writeToolCall.cpi
// >>>>> INCLUDED FROM include_files/startSpindle.cpi
function startSpindle(tool, insertToolCall) {
  if (!noSpindle()) {
    var spindleSpeedIsRequired = insertToolCall || forceSpindleSpeed || isFirstSection() ||
      rpmFormat.areDifferent(spindleSpeed, sOutput.getCurrent()) ||
      (tool.clockwise != getPreviousSection().getTool().clockwise);

    writeStartBlocks(spindleSpeedIsRequired, function () {
      if (spindleSpeedIsRequired || operationNeedsSafeStart) {
        onCommand(COMMAND_START_SPINDLE);
      }
    });
  }
}
// <<<<< INCLUDED FROM include_files/startSpindle.cpi
// >>>>> INCLUDED FROM include_files/parametricFeeds.cpi
properties.useParametricFeed = {
  title      : "Parametric feed",
  description: "Specifies that the feedrates should be output using parameters.",
  group      : "preferences",
  type       : "boolean",
  value      : false,
  scope      : "post"
};
var activeMovements;
var currentFeedId;
validate(settings.parametricFeeds, "Setting 'parametricFeeds' is required but not defined.");
function initializeParametricFeeds(insertToolCall) {
  if (getProperty("useParametricFeed") && getParameter("operation-strategy") != "drill" && !currentSection.hasAnyCycle()) {
    if (!insertToolCall && activeMovements && (getCurrentSectionId() > 0) &&
      ((getPreviousSection().getPatternId() == currentSection.getPatternId()) && (currentSection.getPatternId() != 0))) {
      return; // use the current feeds
    }
  } else {
    activeMovements = undefined;
    return;
  }

  activeMovements = new Array();
  var movements = currentSection.getMovements();

  var id = 0;
  var activeFeeds = new Array();
  if (hasParameter("operation:tool_feedCutting")) {
    if (movements & ((1 << MOVEMENT_CUTTING) | (1 << MOVEMENT_LINK_TRANSITION) | (1 << MOVEMENT_EXTENDED))) {
      var feedContext = new FeedContext(id, localize("Cutting"), getParameter("operation:tool_feedCutting"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_CUTTING] = feedContext;
      if (!hasParameter("operation:tool_feedTransition")) {
        activeMovements[MOVEMENT_LINK_TRANSITION] = feedContext;
      }
      activeMovements[MOVEMENT_EXTENDED] = feedContext;
    }
    ++id;
    if (movements & (1 << MOVEMENT_PREDRILL)) {
      feedContext = new FeedContext(id, localize("Predrilling"), getParameter("operation:tool_feedCutting"));
      activeMovements[MOVEMENT_PREDRILL] = feedContext;
      activeFeeds.push(feedContext);
    }
    ++id;
  }
  if (hasParameter("operation:finishFeedrate")) {
    if (movements & (1 << MOVEMENT_FINISH_CUTTING)) {
      var feedContext = new FeedContext(id, localize("Finish"), getParameter("operation:finishFeedrate"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_FINISH_CUTTING] = feedContext;
    }
    ++id;
  } else if (hasParameter("operation:tool_feedCutting")) {
    if (movements & (1 << MOVEMENT_FINISH_CUTTING)) {
      var feedContext = new FeedContext(id, localize("Finish"), getParameter("operation:tool_feedCutting"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_FINISH_CUTTING] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedEntry")) {
    if (movements & (1 << MOVEMENT_LEAD_IN)) {
      var feedContext = new FeedContext(id, localize("Entry"), getParameter("operation:tool_feedEntry"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LEAD_IN] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedExit")) {
    if (movements & (1 << MOVEMENT_LEAD_OUT)) {
      var feedContext = new FeedContext(id, localize("Exit"), getParameter("operation:tool_feedExit"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LEAD_OUT] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:noEngagementFeedrate")) {
    if (movements & (1 << MOVEMENT_LINK_DIRECT)) {
      var feedContext = new FeedContext(id, localize("Direct"), getParameter("operation:noEngagementFeedrate"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_DIRECT] = feedContext;
    }
    ++id;
  } else if (hasParameter("operation:tool_feedCutting") &&
             hasParameter("operation:tool_feedEntry") &&
             hasParameter("operation:tool_feedExit")) {
    if (movements & (1 << MOVEMENT_LINK_DIRECT)) {
      var feedContext = new FeedContext(id, localize("Direct"), Math.max(getParameter("operation:tool_feedCutting"), getParameter("operation:tool_feedEntry"), getParameter("operation:tool_feedExit")));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_DIRECT] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:reducedFeedrate")) {
    if (movements & (1 << MOVEMENT_REDUCED)) {
      var feedContext = new FeedContext(id, localize("Reduced"), getParameter("operation:reducedFeedrate"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_REDUCED] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedRamp")) {
    if (movements & ((1 << MOVEMENT_RAMP) | (1 << MOVEMENT_RAMP_HELIX) | (1 << MOVEMENT_RAMP_PROFILE) | (1 << MOVEMENT_RAMP_ZIG_ZAG))) {
      var feedContext = new FeedContext(id, localize("Ramping"), getParameter("operation:tool_feedRamp"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_RAMP] = feedContext;
      activeMovements[MOVEMENT_RAMP_HELIX] = feedContext;
      activeMovements[MOVEMENT_RAMP_PROFILE] = feedContext;
      activeMovements[MOVEMENT_RAMP_ZIG_ZAG] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedPlunge")) {
    if (movements & (1 << MOVEMENT_PLUNGE)) {
      var feedContext = new FeedContext(id, localize("Plunge"), getParameter("operation:tool_feedPlunge"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_PLUNGE] = feedContext;
    }
    ++id;
  }
  if (true) { // high feed
    if ((movements & (1 << MOVEMENT_HIGH_FEED)) || (highFeedMapping != HIGH_FEED_NO_MAPPING)) {
      var feed;
      if (hasParameter("operation:highFeedrateMode") && getParameter("operation:highFeedrateMode") != "disabled") {
        feed = getParameter("operation:highFeedrate");
      } else {
        feed = this.highFeedrate;
      }
      var feedContext = new FeedContext(id, localize("High Feed"), feed);
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_HIGH_FEED] = feedContext;
      activeMovements[MOVEMENT_RAPID] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedTransition")) {
    if (movements & (1 << MOVEMENT_LINK_TRANSITION)) {
      var feedContext = new FeedContext(id, localize("Transition"), getParameter("operation:tool_feedTransition"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_TRANSITION] = feedContext;
    }
    ++id;
  }

  for (var i = 0; i < activeFeeds.length; ++i) {
    var feedContext = activeFeeds[i];
    var feedDescription = typeof formatComment == "function" ? formatComment(feedContext.description) : feedContext.description;
    writeBlock(settings.parametricFeeds.feedAssignmentVariable + (settings.parametricFeeds.firstFeedParameter + feedContext.id) + "=" + feedFormat.format(feedContext.feed) + SP + feedDescription);
  }
}

function FeedContext(id, description, feed) {
  this.id = id;
  this.description = description;
  this.feed = feed;
}
// <<<<< INCLUDED FROM include_files/parametricFeeds.cpi
// >>>>> INCLUDED FROM include_files/coolant.cpi
var currentCoolantMode = COOLANT_OFF;
var coolantOff = undefined;
var isOptionalCoolant = false;
var forceCoolant = false;

function setCoolant(coolant) {
  var coolantCodes = getCoolantCodes(coolant);
  if (Array.isArray(coolantCodes)) {
    writeStartBlocks(!isOptionalCoolant, function () {
      if (settings.coolant.singleLineCoolant) {
        writeBlock(coolantCodes.join(getWordSeparator()));
      } else {
        for (var c in coolantCodes) {
          writeBlock(coolantCodes[c]);
        }
      }
    });
    return undefined;
  }
  return coolantCodes;
}

function getCoolantCodes(coolant, format) {
  if (!getProperty("useCoolant", true)) {
    return undefined; // coolant output is disabled by property if it exists
  }
  isOptionalCoolant = false;
  if (typeof operationNeedsSafeStart == "undefined") {
    operationNeedsSafeStart = false;
  }
  var multipleCoolantBlocks = new Array(); // create a formatted array to be passed into the outputted line
  var coolants = settings.coolant.coolants;
  if (!coolants) {
    error(localize("Coolants have not been defined."));
  }
  if (tool.type && tool.type == TOOL_PROBE) { // avoid coolant output for probing
    coolant = COOLANT_OFF;
  }
  if (coolant == currentCoolantMode) {
    if (operationNeedsSafeStart && coolant != COOLANT_OFF) {
      isOptionalCoolant = true;
    } else if (!forceCoolant || coolant == COOLANT_OFF) {
      return undefined; // coolant is already active
    }
  }
  if ((coolant != COOLANT_OFF) && (currentCoolantMode != COOLANT_OFF) && (coolantOff != undefined) && !forceCoolant && !isOptionalCoolant) {
    if (Array.isArray(coolantOff)) {
      for (var i in coolantOff) {
        multipleCoolantBlocks.push(coolantOff[i]);
      }
    } else {
      multipleCoolantBlocks.push(coolantOff);
    }
  }
  forceCoolant = false;

  var m;
  var coolantCodes = {};
  for (var c in coolants) { // find required coolant codes into the coolants array
    if (coolants[c].id == coolant) {
      coolantCodes.on = coolants[c].on;
      if (coolants[c].off != undefined) {
        coolantCodes.off = coolants[c].off;
        break;
      } else {
        for (var i in coolants) {
          if (coolants[i].id == COOLANT_OFF) {
            coolantCodes.off = coolants[i].off;
            break;
          }
        }
      }
    }
  }
  if (coolant == COOLANT_OFF) {
    m = !coolantOff ? coolantCodes.off : coolantOff; // use the default coolant off command when an 'off' value is not specified
  } else {
    coolantOff = coolantCodes.off;
    m = coolantCodes.on;
  }

  if (!m) {
    onUnsupportedCoolant(coolant);
    m = 9;
  } else {
    if (Array.isArray(m)) {
      for (var i in m) {
        multipleCoolantBlocks.push(m[i]);
      }
    } else {
      multipleCoolantBlocks.push(m);
    }
    currentCoolantMode = coolant;
    for (var i in multipleCoolantBlocks) {
      if (typeof multipleCoolantBlocks[i] == "number") {
        multipleCoolantBlocks[i] = mFormat.format(multipleCoolantBlocks[i]);
      }
    }
    if (format == undefined || format) {
      return multipleCoolantBlocks; // return the single formatted coolant value
    } else {
      return m; // return unformatted coolant value
    }
  }
  return undefined;
}
// <<<<< INCLUDED FROM include_files/coolant.cpi
// >>>>> INCLUDED FROM include_files/smoothing.cpi
// collected state below, do not edit
validate(settings.smoothing, "Setting 'smoothing' is required but not defined.");
var smoothing = {
  cancel     : false, // cancel tool length prior to update smoothing for this operation
  isActive   : false, // the current state of smoothing
  isAllowed  : false, // smoothing is allowed for this operation
  isDifferent: false, // tells if smoothing levels/tolerances/both are different between operations
  level      : -1, // the active level of smoothing
  tolerance  : -1, // the current operation tolerance
  force      : false // smoothing needs to be forced out in this operation
};

function initializeSmoothing(_section) {
  var _section = _section !== undefined ? _section : currentSection;
  var smoothingSettings = settings.smoothing;
  var previousLevel = smoothing.level;
  var previousTolerance = xyzFormat.getResultingValue(smoothing.tolerance);

  // format threshold parameters
  var thresholdRoughing = xyzFormat.getResultingValue(smoothingSettings.thresholdRoughing);
  var thresholdSemiFinishing = xyzFormat.getResultingValue(smoothingSettings.thresholdSemiFinishing);
  var thresholdFinishing = xyzFormat.getResultingValue(smoothingSettings.thresholdFinishing);

  // determine new smoothing levels and tolerances
  smoothing.level = parseInt(getProperty("accuracyOverride", "-9999"), 10);
  if ((smoothing.level == -9999) || isNaN(smoothing.level)) {
    // Fall back to the 'post' level property
    smoothing.level = parseInt(_section.getProperty("useSmoothing", "-1"), 10);
  }
  smoothing.level = isNaN(smoothing.level) ? -1 : smoothing.level;
  smoothing.tolerance = xyzFormat.getResultingValue(Math.max(_section.getParameter("operation:tolerance", thresholdFinishing), 0));

  // setup for proper smoothing mode
  switch (getProperty("smoothingMode")) {
  case "A":
  case "B":
    smoothingSettings.roughing = 5;
    smoothingSettings.semi = 3;
    smoothingSettings.semifinishing = 1;
    smoothingSettings.finishing = 2;

    if (smoothing.level >= 1 && smoothing.level <= 6) {
      smoothing.level = [0, 5, 3, 4, 1, 2][smoothing.level-1];
    } else if (smoothing.level != 9999 && smoothing.level != -1) {
      error(localize("Invalid smoothing level for mode A/B:" + smoothing.level));
    }
    break;
  case "M298":
    if (! ( (smoothing.level >= 1 && smoothing.level <= 6) || (smoothing.level >= 21 && smoothing.level <= 23) ||
            (smoothing.level == 9999) || (smoothing.level == -1) ) ) {
      error(localize("Invalid smoothing level for mode M298:" + smoothing.level));
    }
    break;
  }

  var isFinishing = radiusCompensation ||
                    (currentSection.strategy == "contour2d" || currentSection.strategy == "chamfer2d"
                    || currentSection.strategy == "slot" || currentSection.strategy == "path3d"
                    || currentSection.strategy == "bore" || currentSection.strategy == "thread");

  // automatically determine smoothing level
  if (smoothing.level == 9999) {
    if (currentSection.strategy == "face") {
      smoothing.level = smoothingSettings.off; // set roughing level
    } else if (isFinishing) {
      smoothing.level = smoothingSettings.finishing; // set finishing level
    } else if (smoothingSettings.autoLevelCriteria == "stock") { // determine auto smoothing level based on stockToLeave
      var stockToLeave = xyzFormat.getResultingValue(getParameter("operation:stockToLeave", 0));
      var verticalStockToLeave = xyzFormat.getResultingValue(getParameter("operation:verticalStockToLeave", 0));
      if ((stockToLeave >= thresholdRoughing) ||
          ((stockToLeave != 0) && (verticalStockToLeave >= thresholdRoughing))) {
        smoothing.level = smoothingSettings.roughing; // set roughing level
      } else if ((stockToLeave > thresholdSemiFinishing) ||
                ((stockToLeave > 0) && (verticalStockToLeave > thresholdSemiFinishing))) {
        smoothing.level = smoothingSettings.semi; // set semi level
      } else if ((stockToLeave > thresholdFinishing) ||
            (verticalStockToLeave > thresholdFinishing)) {
        smoothing.level = smoothingSettings.semifinishing; // set semi-finishing level
      } else {
        smoothing.level = smoothingSettings.finishing; // set finishing level
      }
    } else { // detemine auto smoothing level based on operation tolerance instead of stockToLeave
      if (smoothing.tolerance >= thresholdRoughing) {
        smoothing.level = smoothingSettings.roughing; // set roughing level
      } else if (smoothing.tolerance > thresholdSemiFinishing) {
        smoothing.level = smoothingSettings.semi; // set semi level
      } else if (smoothing.tolerance > thresholdFinishing) {
          smoothing.level = smoothingSettings.semifinishing; // set semi-finishing level
      } else {
          smoothing.level = smoothingSettings.finishing; // set finishing level
      }
    }
  }

  if (smoothing.level == -1) { // useSmoothing is disabled
    smoothing.isAllowed = false;
  } else {
    smoothing.isAllowed = !(_section.getTool().type == TOOL_PROBE || isDrillingCycle(_section)) || (_section.isConnectionSection && _section.isConnectionSection() && _section.isMultiAxis());
    if (isFirstSection()) {
      smoothing.isActive = undefined;
    }
  }
  if (!smoothing.isAllowed) {
    smoothing.level = -1;
    smoothing.tolerance = -1;
  }

  switch (smoothingSettings.differenceCriteria) {
  case "level":
    smoothing.isDifferent = smoothing.level != previousLevel;
    break;
  case "tolerance":
    smoothing.isDifferent = smoothing.tolerance != previousTolerance;
    break;
  case "both":
    smoothing.isDifferent = smoothing.level != previousLevel || smoothing.tolerance != previousTolerance;
    break;
  default:
    error(localize("Unsupported smoothing criteria."));
    return;
  }

  // tool length compensation needs to be canceled when smoothing state/level changes
  if (smoothingSettings.cancelCompensation) {
    smoothing.cancel = !isFirstSection() && smoothing.isDifferent;
  }
}
// <<<<< INCLUDED FROM include_files/smoothing.cpi
// >>>>> INCLUDED FROM include_files/writeProgramHeader.cpi
properties.writeMachine = {
  title      : "Write machine",
  description: "Output the machine settings in the header of the program.",
  group      : "formats",
  type       : "boolean",
  value      : true,
  scope      : "post"
};
properties.writeTools = {
  title      : "Write tool list",
  description: "Output a tool list in the header of the program.",
  group      : "formats",
  type       : "boolean",
  value      : true,
  scope      : "post"
};
function writeProgramHeader() {
  writeComment("File: " + getGlobalParameter("document-path"));
  writeComment("Date: " + getGlobalParameter("generated-at"));

  // Any job notes
  if (getProperty("showNotes")) {
    writeSetupNotes();

    // Write sub section notes
    var hasNotes=false;
    for (var i = 0; i < getNumberOfSections(); ++i) {
      var section = getSection(i);
      var notes = section.getParameter("notes")
      if (notes) {
        writeln("");
        writeComment(section.getParameter("operation-comment"), "");
        writeNotes(notes);
      }
    }
  }
  writeln("");

  // dump machine configuration
  var vendor = machineConfiguration.getVendor();
  var model = machineConfiguration.getModel();
  var mDescription = machineConfiguration.getDescription();
  if (getProperty("writeMachine") && (vendor || model || mDescription)) {
    writeComment(localize("Machine"));
    if (vendor) {
      writeComment("  " + localize("vendor") + ": " + vendor);
    }
    if (model) {
      writeComment("  " + localize("model") + ": " + model);
    }
    if (mDescription) {
      writeComment("  " + localize("description") + ": " + mDescription);
    }
  }

  // dump tool information
  if (getProperty("writeTools")) {
    if (false) { // set to true to use the post kernel version of the tool list
      writeToolTable(TOOL_NUMBER_COL);
    } else {
      var zRanges = {};
      if (is3D()) {
        var numberOfSections = getNumberOfSections();
        for (var i = 0; i < numberOfSections; ++i) {
          var section = getSection(i);
          var zRange = section.getGlobalZRange();
          var tool = section.getTool();
          if (zRanges[tool.number]) {
            zRanges[tool.number].expandToRange(zRange);
          } else {
            zRanges[tool.number] = zRange;
          }
        }
      }
      var tools = getToolTable();
      if (tools.getNumberOfTools() > 0) {
        for (var i = 0; i < tools.getNumberOfTools(); ++i) {
          var tool = tools.getTool(i);
          var comment = (getProperty("toolAsName") ? "\"" + tool.description.toUpperCase() + "\"" : "T" + toolFormat.format(tool.number)) + " " +
          "D=" + xyzFormat.format(tool.diameter) + " " +
          localize("CR") + "=" + xyzFormat.format(tool.cornerRadius);
          if ((tool.taperAngle > 0) && (tool.taperAngle < Math.PI)) {
            comment += " " + localize("TAPER") + "=" + taperFormat.format(tool.taperAngle) + localize("deg");
          }
          if (zRanges[tool.number]) {
            comment += " - " + localize("ZMIN") + "=" + xyzFormat.format(zRanges[tool.number].getMinimum());
          }
          comment += " - " + getToolTypeName(tool.type);
          comment += " - L=" + xyzFormat.format(tool.bodyLength) + "/" + xyzFormat.format(tool.bodyLength + tool.holderLength);
          writeComment(comment);
        }
        writeln("");
      }
    }
  }

  if (errorOnDuplicateTool) {
    // check for duplicate tool number
    for (var i = 0; i < getNumberOfSections(); ++i) {
      var sectioni = getSection(i);
      var tooli = sectioni.getTool();
      for (var j = i + 1; j < getNumberOfSections(); ++j) {
        var sectionj = getSection(j);
        var toolj = sectionj.getTool();
        if (tooli.number == toolj.number) {
          if (xyzFormat.areDifferent(tooli.diameter, toolj.diameter) ||
              xyzFormat.areDifferent(tooli.cornerRadius, toolj.cornerRadius) ||
              abcFormat.areDifferent(tooli.taperAngle, toolj.taperAngle) ||
              (tooli.numberOfFlutes != toolj.numberOfFlutes)) {
            error(
              subst(
                localize("Using the same tool number for different cutter geometry for operation '%1' and '%2'."),
                sectioni.hasParameter("operation-comment") ? sectioni.getParameter("operation-comment") : ("#" + (i + 1)),
                sectionj.hasParameter("operation-comment") ? sectionj.getParameter("operation-comment") : ("#" + (j + 1))
              )
            );
            return;
          }
        }
      }
    }
  }

  // Write stock
  writeStock();
}
// <<<<< INCLUDED FROM include_files/writeProgramHeader.cpi

// >>>>> INCLUDED FROM include_files/onRapid_fanuc.cpi
function onRapid(_x, _y, _z) {
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  if (x || y || z) {
    if (pendingRadiusCompensation >= 0) {
      error(localize("Radius compensation mode cannot be changed at rapid traversal."));
      return;
    }
    if(settings.probing.probeOn && !productionMode) {
      protectedProbeMove(undefined, _x, _y, _z);
    } else {
      writeBlock(gMotionModal.format(0), x, y, z);
    }
    forceFeed();
  }
}
// <<<<< INCLUDED FROM include_files/onRapid_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onLinear_fanuc.cpi
function onLinear(_x, _y, _z, feed) {
  if (pendingRadiusCompensation >= 0) {
    xOutput.reset();
    yOutput.reset();
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var f = getFeed(feed);
  if (x || y || z) {
    if (pendingRadiusCompensation >= 0) {
      pendingRadiusCompensation = -1;
      var d = getSetting("outputToolDiameterOffset", true) ? diameterOffsetFormat.format(tool.diameterOffset) : "";
      writeBlock(gPlaneModal.format(17));
      switch (radiusCompensation) {
      case RADIUS_COMPENSATION_LEFT:
        writeBlock(gMotionModal.format(1), gFormat.format(41), x, y, z, d, f);
        break;
      case RADIUS_COMPENSATION_RIGHT:
        writeBlock(gMotionModal.format(1), gFormat.format(42), x, y, z, d, f);
        break;
      default:
        writeBlock(gMotionModal.format(1), gFormat.format(40), x, y, z, f);
      }
    } else {
      writeBlock(gMotionModal.format(1), x, y, z, f);
    }
  } else if (f) {
    if (getNextRecord().isMotion()) { // try not to output feed without motion
      forceFeed(); // force feed on next line
    } else {
      writeBlock(gMotionModal.format(1), f);
    }
  }
}
// <<<<< INCLUDED FROM include_files/onLinear_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onRapid5D_fanuc.cpi
function onRapid5D(_x, _y, _z, _a, _b, _c) {
  if (pendingRadiusCompensation >= 0) {
    error(localize("Radius compensation mode cannot be changed at rapid traversal."));
    return;
  }
  if (!currentSection.isOptimizedForMachine()) {
    forceXYZ();
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var a = currentSection.isOptimizedForMachine() ? aOutput.format(_a) : toolVectorOutputI.format(_a);
  var b = currentSection.isOptimizedForMachine() ? bOutput.format(_b) : toolVectorOutputJ.format(_b);
  var c = currentSection.isOptimizedForMachine() ? cOutput.format(_c) : toolVectorOutputK.format(_c);

  if (x || y || z || a || b || c) {
    writeBlock(gMotionModal.format(0), x, y, z, a, b, c);
    forceFeed();
  }
}
// <<<<< INCLUDED FROM include_files/onRapid5D_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onLinear5D_fanuc.cpi
function onLinear5D(_x, _y, _z, _a, _b, _c, feed, feedMode) {
  if (pendingRadiusCompensation >= 0) {
    error(localize("Radius compensation cannot be activated/deactivated for 5-axis move."));
    return;
  }
  if (!currentSection.isOptimizedForMachine()) {
    forceXYZ();
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var a = currentSection.isOptimizedForMachine() ? aOutput.format(_a) : toolVectorOutputI.format(_a);
  var b = currentSection.isOptimizedForMachine() ? bOutput.format(_b) : toolVectorOutputJ.format(_b);
  var c = currentSection.isOptimizedForMachine() ? cOutput.format(_c) : toolVectorOutputK.format(_c);
  if (feedMode == FEED_INVERSE_TIME) {
    forceFeed();
  }
  var f = feedMode == FEED_INVERSE_TIME ? inverseTimeOutput.format(feed) : getFeed(feed);
  var fMode = feedMode == FEED_INVERSE_TIME ? 93 : getProperty("useG95") ? 95 : 94;

  if (x || y || z || a || b || c) {
    writeBlock(gFeedModeModal.format(fMode), gMotionModal.format(1), x, y, z, a, b, c, f);
  } else if (f) {
    if (getNextRecord().isMotion()) { // try not to output feed without motion
      forceFeed(); // force feed on next line
    } else {
      writeBlock(gFeedModeModal.format(fMode), gMotionModal.format(1), f);
    }
  }
}
// <<<<< INCLUDED FROM include_files/onLinear5D_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onCircular_fanuc.cpi
function onCircular(clockwise, cx, cy, cz, x, y, z, feed) {
  if (pendingRadiusCompensation >= 0) {
    error(localize("Radius compensation cannot be activated/deactivated for a circular move."));
    return;
  }

  if (((gRotationModal.getCurrent() == 68) || (gRotationModal.getCurrent() == 68.2)) && (getCircularPlane() != PLANE_XY)) { // Can't switch planes while rotation active
    writeComment("Linearising due to active G68 rotation");
    linearize(tolerance);
    return;
  }
  var start = getCurrentPosition();

  if (isFullCircle()) {
    if (getProperty("useRadius") || isHelical()) { // radius mode does not support full arcs
      linearize(tolerance);
      return;
    }
    switch (getCircularPlane()) {
    case PLANE_XY:
      writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), iOutput.format(cx - start.x), jOutput.format(cy - start.y), getFeed(feed));
      break;
    case PLANE_ZX:
      writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), iOutput.format(cx - start.x), kOutput.format(cz - start.z), getFeed(feed));
      break;
    case PLANE_YZ:
      writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), jOutput.format(cy - start.y), kOutput.format(cz - start.z), getFeed(feed));
      break;
    default:
      linearize(tolerance);
    }
  } else if (!getProperty("useRadius")) {
    switch (getCircularPlane()) {
    case PLANE_XY:
      writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), iOutput.format(cx - start.x), jOutput.format(cy - start.y), getFeed(feed));
      break;
    case PLANE_ZX:
      writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), iOutput.format(cx - start.x), kOutput.format(cz - start.z), getFeed(feed));
      break;
    case PLANE_YZ:
      writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), jOutput.format(cy - start.y), kOutput.format(cz - start.z), getFeed(feed));
      break;
    default:
      if (getProperty("allow3DArcs")) {
        // make sure maximumCircularSweep is well below 360deg
        // we could use G02.4 or G03.4 - direction is calculated
        var ip = getPositionU(0.5);
        writeBlock(gMotionModal.format(clockwise ? 2.4 : 3.4), xOutput.format(ip.x), yOutput.format(ip.y), zOutput.format(ip.z), getFeed(feed));
        writeBlock(xOutput.format(x), yOutput.format(y), zOutput.format(z));
      } else {
        linearize(tolerance);
      }
    }
  } else { // use radius mode
    var r = getCircularRadius();
    if (toDeg(getCircularSweep()) > (180 + 1e-9)) {
      r = -r; // allow up to <360 deg arcs
    }
    switch (getCircularPlane()) {
    case PLANE_XY:
      writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + rFormat.format(r), getFeed(feed));
      break;
    case PLANE_ZX:
      writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + rFormat.format(r), getFeed(feed));
      break;
    case PLANE_YZ:
      writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + rFormat.format(r), getFeed(feed));
      break;
    default:
      if (getProperty("allow3DArcs")) {
        // make sure maximumCircularSweep is well below 360deg
        // we could use G02.4 or G03.4 - direction is calculated
        var ip = getPositionU(0.5);
        writeBlock(gMotionModal.format(clockwise ? 2.4 : 3.4), xOutput.format(ip.x), yOutput.format(ip.y), zOutput.format(ip.z), getFeed(feed));
        writeBlock(xOutput.format(x), yOutput.format(y), zOutput.format(z));
      } else {
        linearize(tolerance);
      }
    }
  }
}
// <<<<< INCLUDED FROM include_files/onCircular_fanuc.cpi
// >>>>> INCLUDED FROM include_files/workPlaneFunctions_fanuc.cpi
var gRotationModal = createOutputVariable({current : 69,
  onchange: function () {
    state.twpIsActive = gRotationModal.getCurrent() != 69;
    if (typeof probeVariables != "undefined") {
      probeVariables.outputRotationCodes = probeVariables.probeAngleMethod == "G68";
    }
    machineSimulation({}); // update machine simulation TWP state
  }}, gFormat);

var currentWorkPlaneABC = undefined;
function forceWorkPlane() {
  currentWorkPlaneABC = undefined;
}

function cancelWCSRotation() {
  if (typeof gRotationModal != "undefined" && gRotationModal.getCurrent() == 68) {
    cancelWorkPlane(true);
  }
}

function cancelWorkPlane(force) {
  if (typeof gRotationModal != "undefined") {
    if (force) {
      gRotationModal.reset();
    }
    var command = gRotationModal.format(69);
    if (command) {
      writeBlock(command); // cancel frame
      forceWorkPlane();
    }
  }
}

function setWorkPlane(abc) {
  if (!settings.workPlaneMethod.forceMultiAxisIndexing && is3D() && !machineConfiguration.isMultiAxisConfiguration()) {
    return; // ignore
  }
  var workplaneIsRequired = (currentWorkPlaneABC == undefined) ||
    abcFormat.areDifferent(abc.x, currentWorkPlaneABC.x) ||
    abcFormat.areDifferent(abc.y, currentWorkPlaneABC.y) ||
    abcFormat.areDifferent(abc.z, currentWorkPlaneABC.z);

  writeStartBlocks(workplaneIsRequired, function () {
    writeRetract(Z);
    if (getSetting("retract.homeXY.onIndexing", false)) {
      writeRetract(settings.retract.homeXY.onIndexing);
    }
    if ((state.lengthCompensationActive || state.tcpIsActive) && typeof disableLengthCompensation == "function") {
      disableLengthCompensation(); // cancel tool lenght compensation / TCP prior to output TWP
    }
    if (settings.workPlaneMethod.useTiltedWorkplane) {
      onCommand(COMMAND_UNLOCK_MULTI_AXIS);
      cancelWorkPlane();
      if (machineConfiguration.isMultiAxisConfiguration()) {
        var machineABC = abc.isNonZero() ? (currentSection.isMultiAxis() ? getCurrentDirection() : getWorkPlaneMachineABC(currentSection, false)) : abc;
        if (settings.workPlaneMethod.useABCPrepositioning || machineABC.isZero()) {
          positionABC(machineABC);
        } else {
          setCurrentABC(machineABC);
        }
      }
      if (abc.isNonZero() || !machineConfiguration.isMultiAxisConfiguration()) {
        gRotationModal.reset();
        writeBlock(
          gRotationModal.format(68.2), "X" + xyzFormat.format(currentSection.workOrigin.x), "Y" + xyzFormat.format(currentSection.workOrigin.y), "Z" + xyzFormat.format(currentSection.workOrigin.z),
          "I" + abcFormat.format(abc.x), "J" + abcFormat.format(abc.y), "K" + abcFormat.format(abc.z)
        ); // set frame
        writeBlock(gFormat.format(53.1)); // turn machine
        machineSimulation({a:getCurrentABC().x, b:getCurrentABC().y, c:getCurrentABC().z, coordinates:MACHINE, eulerAngles:abc});
      }
    } else {
      positionABC(abc, true);
    }
    if (!currentSection.isMultiAxis()) {
      onCommand(COMMAND_LOCK_MULTI_AXIS);
    }
    currentWorkPlaneABC = abc;
  });
}
// <<<<< INCLUDED FROM include_files/workPlaneFunctions_fanuc.cpi
// >>>>> INCLUDED FROM include_files/initialPositioning_fanuc.cpi
/**
 * Writes the initial positioning procedure for a section to get to the start position of the toolpath.
 * @param {Vector} position The initial position to move to
 * @param {boolean} isRequired true: Output full positioning, false: Output full positioning in optional state or output simple positioning only
 * @param {String} codes1 Allows to add additional code to the first positioning line
 * @param {String} codes2 Allows to add additional code to the second positioning line (if applicable)
 * @example
  var myVar1 = formatWords("T" + tool.number, currentSection.wcs);
  var myVar2 = getCoolantCodes(tool.coolant);
  writeInitialPositioning(initialPosition, isRequired, myVar1, myVar2);
*/
function writeInitialPositioning(position, isRequired, codes1, codes2) {
  var motionCode = {single:0, multi:0};
  switch (highFeedMapping) {
  case HIGH_FEED_MAP_ANY:
    motionCode = {single:1, multi:1}; // map all rapid traversals to high feed
    break;
  case HIGH_FEED_MAP_MULTI:
    motionCode = {single:0, multi:1}; // map rapid traversal along more than one axis to high feed
    break;
  }
  var feed = (highFeedMapping != HIGH_FEED_NO_MAPPING) ? getFeed(highFeedrate) : "";
  var hOffset = getSetting("outputToolLengthOffset", true) ? hFormat.format(tool.lengthOffset) : "";
  var additionalCodes = [formatWords(codes1), formatWords(codes2)];

  forceModals(gMotionModal);
  writeStartBlocks(isRequired, function() {
    var modalCodes = formatWords(gAbsIncModal.format(90), gPlaneModal.format(17));
    if (typeof disableLengthCompensation == "function") {
      disableLengthCompensation(!isRequired); // cancel tool length compensation prior to enabling it, required when switching G43/G43.4 modes
    }

    if (machineConfiguration.isHeadConfiguration()) { // head/head head/table kinematics
      cancelTransformation();
      var machineABC = currentSection.isMultiAxis() ? defineWorkPlane(currentSection, false) : getWorkPlaneMachineABC(currentSection, false);
      machineConfiguration.setToolLength(getSetting("workPlaneMethod.compensateToolLength", false) ? getBodyLength(currentSection.getTool()) : 0); // define the tool length for head adjustments
      var mode = currentSection.isOptimizedForMachine() ? TCP_XYZ_OPTIMIZED : TCP_XYZ;
      var globalPosition = getGlobalPosition(currentSection.getInitialPosition());
      var machinePosition = machineConfiguration.getOptimizedPosition(globalPosition, machineABC, mode, OPTIMIZE_BOTH, true);
      var prePosition = (currentSection.isOptimizedForMachine() || currentSection.isMultiAxis()) ? position :
        (settings.workPlaneMethod.useTiltedWorkplane && !tcp.isSupportedByMachine) ? machinePosition : globalPosition;

      cancelWorkPlane();
      positionABC(machineABC);
      if ((getSetting("workPlaneMethod.useTiltedWorkplane", false) && tcp.isSupportedByMachine && getCurrentDirection().isNonZero()) || tcp.isSupportedByOperation) {
        writeBlock(getOffsetCode(true), hOffset); // force TCP for prepositioning although the operation may not require it
      }
      writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(prePosition.x), yOutput.format(prePosition.y), feed, additionalCodes[0]);
      machineSimulation({x:prePosition.x, y:prePosition.y});
      if (currentSection.isMultiAxis() || getSetting("headPositioningMethod", 0) == 1) {
        var lengthComp = state.lengthCompensationActive ? {code:undefined, hOffset:undefined} : {code:getOffsetCode(), hOffset:hOffset};
        writeBlock(modalCodes, gMotionModal.format(motionCode.single), lengthComp.code, zOutput.format(prePosition.z), lengthComp.hOffset, additionalCodes[1]);
        machineSimulation({z:prePosition.z});
      }

      if (!currentSection.isMultiAxis()) {
        if (state.tcpIsActive && !tcp.isSupportedByOperation && typeof disableLengthCompensation == "function") {
          disableLengthCompensation();
        }
        if (getSetting("workPlaneMethod.useTiltedWorkplane", false) && getCurrentDirection().isNonZero()) {
          var saveRetractedState = [state.retractedX, state.retractedY, state.retractedZ];
          state.retractedX = state.retractedY = state.retractedZ = true; // set retracted states to true to avoid retraction
          defineWorkPlane(currentSection, true); // apply workplane for the operation if TWP is supported
          [state.retractedX, state.retractedY, state.retractedZ] = saveRetractedState; // restore retracted states
        }
        if (!state.lengthCompensationActive) {
          if (state.twpIsActive) {
            forceXYZ();
          }
          if (getSetting("headPositioningMethod", 0) == 1) {
            writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(position.x), yOutput.format(position.y));
            machineSimulation({x:position.x, y:position.y});
            writeBlock(modalCodes, gMotionModal.format(motionCode.single), getOffsetCode(), zOutput.format(position.z), hOffset);
            machineSimulation({z:position.z});
          } else {
            writeBlock(modalCodes, getOffsetCode(), gMotionModal.format(motionCode.single), xOutput.format(position.x), yOutput.format(position.y), zOutput.format(position.z), hOffset);
            machineSimulation({x:position.x, y:position.y, z:position.z});
          }
        }
      }
      forceFeed();
    } else {
      // multi axis prepositioning with TWP
      if (currentSection.isMultiAxis() && getSetting("workPlaneMethod.prepositionWithTWP", true) && getSetting("workPlaneMethod.useTiltedWorkplane", false) &&
        tcp.isSupportedByOperation && getCurrentDirection().isNonZero()) {
        var W = machineConfiguration.isMultiAxisConfiguration() ? machineConfiguration.getOrientation(getCurrentDirection()) :
          Matrix.getOrientationFromDirection(getCurrentDirection());
        var prePosition = W.getTransposed().multiply(position);
        var angles = W.getEuler2(settings.workPlaneMethod.eulerConvention);
        setWorkPlane(angles);
        writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(prePosition.x), yOutput.format(prePosition.y), feed, additionalCodes[0]);
        machineSimulation({x:prePosition.x, y:prePosition.y});
        cancelWorkPlane();
        writeBlock(getOffsetCode(), hOffset, additionalCodes[1]); // omit Z-axis output is desired
        forceAny(); // required to output XYZ coordinates in the following line
      } else {
        writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(position.x), yOutput.format(position.y), feed, additionalCodes[0]);
        machineSimulation({x:position.x, y:position.y});
        writeBlock(gMotionModal.format(motionCode.single), getOffsetCode(), zOutput.format(position.z), hOffset, additionalCodes[1]);
        machineSimulation(tcp.isSupportedByOperation ? {x:position.x, y:position.y, z:position.z} : {z:position.z});
      }
    }
    forceModals(gMotionModal);
    if (isRequired) {
      additionalCodes = []; // clear additionalCodes buffer
    }
  });

  validate(!validateLengthCompensation || state.lengthCompensationActive, "Tool length compensation is not active."); // make sure that lenght compensation is enabled
  if (!isRequired) { // simple positioning
    var modalCodes = formatWords(gAbsIncModal.format(90), gPlaneModal.format(17));
    forceXYZ();
    if (!settings.probing.probeOn || productionMode) {
      if (!state.retractedZ && xyzFormat.getResultingValue(getCurrentPosition().z) < xyzFormat.getResultingValue(position.z)) {
        writeBlock(modalCodes, gMotionModal.format(motionCode.single), zOutput.format(position.z), feed);
        machineSimulation({z:position.z});
      }
      writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(position.x), yOutput.format(position.y), feed, additionalCodes);
      machineSimulation({x:position.x, y:position.y});
    } else {
      writeBlock(modalCodes, feed, additionalCodes);
      protectedProbeMove(undefined, position.x, position.y, position.z);
    }
  }
  if (machineConfiguration.isMultiAxisConfiguration() && !currentSection.isMultiAxis()) {
    onCommand(COMMAND_LOCK_MULTI_AXIS);
  }
}

Matrix.getOrientationFromDirection = function (ijk) {
  var forward = ijk;
  var unitZ = new Vector(0, 0, 1);
  var W;
  if (Math.abs(Vector.dot(forward, unitZ)) < 0.5) {
    var imX = Vector.cross(forward, unitZ).getNormalized();
    W = new Matrix(imX, Vector.cross(forward, imX), forward);
  } else {
    var imX = Vector.cross(new Vector(0, 1, 0), forward).getNormalized();
    W = new Matrix(imX, Vector.cross(forward, imX), forward);
  }
  return W;
};
// <<<<< INCLUDED FROM include_files/initialPositioning_fanuc.cpi
// >>>>> INCLUDED FROM include_files/getOffsetCode_fanuc.cpi
var toolLengthCompOutput = createOutputVariable({control : CONTROL_FORCE,
  onchange: function() {
    state.tcpIsActive = toolLengthCompOutput.getCurrent() == 43.4 || toolLengthCompOutput.getCurrent() == 43.5;
    state.lengthCompensationActive = toolLengthCompOutput.getCurrent() != 49;
    machineSimulation({}); // update machine simulation TCP state
  }
}, gFormat);

function getOffsetCode(forceTCP) {
  if (!getSetting("outputToolLengthCompensation", true) && toolLengthCompOutput.isEnabled()) {
    state.lengthCompensationActive = true; // always assume that length compensation is active
    toolLengthCompOutput.disable();
  }
  var offsetCode = 43;
  if (tcp.isSupportedByOperation || forceTCP) {
    offsetCode = machineConfiguration.isMultiAxisConfiguration() ? 43.4 : 43.5;
  }
  return toolLengthCompOutput.format(offsetCode);
}
// <<<<< INCLUDED FROM include_files/getOffsetCode_fanuc.cpi
// >>>>> INCLUDED FROM include_files/disableLengthCompensation_fanuc.cpi
function disableLengthCompensation(force) {
  if (state.lengthCompensationActive || force) {
    if (force) {
      toolLengthCompOutput.reset();
    }
    if (!getSetting("allowCancelTCPBeforeRetracting", false)) {
      validate(state.retractedZ, "Cannot cancel tool length compensation if the machine is not fully retracted.");
    }
    writeBlock(toolLengthCompOutput.format(49));
  }
}
// <<<<< INCLUDED FROM include_files/disableLengthCompensation_fanuc.cpi
// >>>>> INCLUDED FROM include_files/rewind.cpi
function onMoveToSafeRetractPosition() {
  if (!getSetting("allowCancelTCPBeforeRetracting", false)) {
    writeRetract(Z);
  }
  if (state.tcpIsActive) { // cancel TCP so that tool doesn't follow rotaries
    if (typeof setTCP == "function") {
      setTCP(false);
    } else {
      disableLengthCompensation(false);
    }
  }
  writeRetract(Z);
  if (getSetting("retract.homeXY.onIndexing", false)) {
    writeRetract(settings.retract.homeXY.onIndexing);
  }
}

/** Rotate axes to new position above reentry position */
function onRotateAxes(_x, _y, _z, _a, _b, _c) {
  // position rotary axes
  xOutput.disable();
  yOutput.disable();
  zOutput.disable();
  if (typeof unwindABC == "function") {
    unwindABC(new Vector(_a, _b, _c), false);
  }
  onRapid5D(_x, _y, _z, _a, _b, _c);
  setCurrentABC(new Vector(_a, _b, _c));
  machineSimulation({a:_a, b:_b, c:_c, coordinates:MACHINE});
  xOutput.enable();
  yOutput.enable();
  zOutput.enable();
  forceXYZ();
}

/** Return from safe position after indexing rotaries. */
function onReturnFromSafeRetractPosition(_x, _y, _z) {
  if (!machineConfiguration.isHeadConfiguration()) {
    writeInitialPositioning(new Vector(_x, _y, _z), true);
    if (highFeedMapping != HIGH_FEED_NO_MAPPING) {
      onLinear5D(_x, _y, _z, getCurrentDirection().x, getCurrentDirection().y, getCurrentDirection().z, highFeedrate);
    } else {
      onRapid5D(_x, _y, _z, getCurrentDirection().x, getCurrentDirection().y, getCurrentDirection().z);
    }
    machineSimulation({x:_x, y:_y, z:_z, a:getCurrentDirection().x, b:getCurrentDirection().y, c:getCurrentDirection().z});
  } else {
    if (tcp.isSupportedByOperation) {
      if (typeof setTCP == "function") {
        setTCP(true);
      } else {
        writeBlock(getOffsetCode(), hFormat.format(tool.lengthOffset));
      }
    }
    forceXYZ();
    xOutput.reset();
    yOutput.reset();
    zOutput.disable();
    if (highFeedMapping != HIGH_FEED_NO_MAPPING) {
      onLinear(_x, _y, _z, highFeedrate);
    } else {
      onRapid(_x, _y, _z);
    }
    machineSimulation({x:_x, y:_y});
    zOutput.enable();
    invokeOnRapid(_x, _y, _z);
  }
}
// <<<<< INCLUDED FROM include_files/rewind.cpi
// >>>>> INCLUDED FROM include_files/commonInspectionFunctions_fanuc.cpi
var macroFormat = createFormat({prefix:(typeof inspectionVariables == "undefined" ? "#" : inspectionVariables.localVariablePrefix), decimals:0});
var macroRoundingFormat = (unit == MM) ? "[53]" : "[44]";
var isDPRNTopen = false;

var WARNING_OUTDATED = 0;
var toolpathIdFormat = createFormat({decimals:5, type:FORMAT_REAL});
var patternInstances = new Array();
var initializePatternInstances = true; // initialize patternInstances array the first time inspectionGetToolpathId is called
function inspectionGetToolpathId(section) {
  if (initializePatternInstances) {
    for (var i = 0; i < getNumberOfSections(); ++i) {
      var _section = getSection(i);
      if (_section.getInternalPatternId) {
        var sectionId = _section.getId();
        var patternId = _section.getInternalPatternId();
        var isPatterned = _section.isPatterned && _section.isPatterned();
        var isMirrored = patternId != _section.getPatternId();
        if (isPatterned || isMirrored) {
          var isKnownPatternId = false;
          for (var j = 0; j < patternInstances.length; j++) {
            if (patternId == patternInstances[j].patternId) {
              patternInstances[j].patternIndex++;
              patternInstances[j].sections.push(sectionId);
              isKnownPatternId = true;
              break;
            }
          }
          if (!isKnownPatternId) {
            patternInstances.push({patternId:patternId, patternIndex:1, sections:[sectionId]});
          }
        }
      }
    }
    initializePatternInstances = false;
  }

  var _operationId = section.getParameter("autodeskcam:operation-id", "");
  var key = -1;
  for (k in patternInstances) {
    if (patternInstances[k].patternId == _operationId) {
      key = k;
      break;
    }
  }
  var _patternId = (key > -1) ? patternInstances[key].sections.indexOf(section.getId()) + 1 : 0;
  var _cycleId = cycle && ("cycleID" in cycle) ? cycle.cycleID : section.getParameter("cycleID", 0);
  if (isProbeOperation(section) && _cycleId == 0 && getGlobalParameter("product-id").toLowerCase().indexOf("fusion") > -1) {
    // we expect the cycleID to be non zero always for macro probing toolpaths, Fusion only
    warningOnce(localize("Outdated macro probing operations detected. Please regenerate all macro probing operations."), WARNING_OUTDATED);
  }
  if (_patternId > 99) {
    error(subst(localize("The maximum number of pattern instances is limited to 99" + EOL +
      "You need to split operation '%1' into separate pattern groups."
    ), section.getParameter("operation-comment", "")));
  }
  if (_cycleId > 99) {
    error(subst(localize("The maximum number of probing cycles is limited to 99" + EOL +
      "You need to split operation '%1' to multiple operations with less than 100 cycles in each operation."
    ), section.getParameter("operation-comment", "")));
  }
  return toolpathIdFormat.format(_operationId + (_cycleId * 0.01) + (_patternId * 0.0001) + 0.00001);
}

var localVariableStart = 19;
var localVariable = [
  macroFormat.format(localVariableStart + 1),
  macroFormat.format(localVariableStart + 2),
  macroFormat.format(localVariableStart + 3),
  macroFormat.format(localVariableStart + 4),
  macroFormat.format(localVariableStart + 5),
  macroFormat.format(localVariableStart + 6)
];

function defineLocalVariable(indx, value) {
  writeln(localVariable[indx - 1] + " = " + value);
}

function formatLocalVariable(prefix, indx, rnd) {
  return prefix + localVariable[indx - 1] + rnd;
}

function inspectionCreateResultsFileHeader() {
  if (isDPRNTopen) {
    if (!getProperty("singleResultsFile")) {
      writeln("DPRNT[END]");
      writeBlock("PCLOS");
      isDPRNTopen = false;
    }
  }

  // OWG v3_5: In 'raw' mode with Blum probe, O8716 handles POPEN/PCLOS internally.
  // Suppress post-level POPEN/DPRNT header to prevent port collision alarms CM4023 / SM4041.
  if (isProbeOperation() && getProperty("probeResultsFormat") == "raw") {
    return;
  }

  if (isProbeOperation() && !printProbeResults()) {
    return; // if print results is not desired by probe/ probeWCS
  }

  if (!isDPRNTopen) {
    // writeBlock("PCLOS"); // <-- Commented out to fix CM4023 "Print Open/Close error" on
    //                          Brother Speedio. PCLOS here is wrong: the surrounding
    //                          'if (!isDPRNTopen)' guarantees no file is open, so closing
    //                          a non-existent file trips the controller. POPEN below is
    //                          sufficient to start the result file.
    writeBlock("POPEN");
    // check for existence of none alphanumeric characters but not spaces
    var resFile;
    if (getProperty("singleResultsFile")) {
      resFile = getParameter("job-description") + "-RESULTS";
    } else {
      resFile = getParameter("operation-comment") + "-RESULTS";
    }
    resFile = resFile.replace(/:/g, "-");
    resFile = resFile.replace(/[^a-zA-Z0-9 -]/g, "");
    resFile = resFile.replace(/\s/g, "-");
    // OWG v3_5: Sanitize DPRNT text per C00 manual Sec 6.6.2
    resFile = sanitizeDPRNT(resFile);
    writeln("DPRNT[START]");
    writeln("DPRNT[RESULTSFILE*" + resFile + "]");
    if (hasGlobalParameter("document-id")) {
      writeln("DPRNT[DOCUMENTID*" + sanitizeDPRNT(getGlobalParameter("document-id")) + "]");
    }
    if (hasGlobalParameter("model-version")) {
      writeln("DPRNT[MODELVERSION*" + sanitizeDPRNT(getGlobalParameter("model-version")) + "]");
    }
  }
  // OWG v3_5: Accurately track isDPRNTopen for both probe and surface inspection operations
  if ((isProbeOperation() && printProbeResults()) || isInspectionOperation()) {
    isDPRNTopen = true;
  }
}

function getPointNumber() {
  if (typeof inspectionWriteVariables == "function") {
    return (inspectionVariables.pointNumber);
  } else {
    return ("#122[60]");
  }
}

function inspectionWriteCADTransform() {
  var cadOrigin = currentSection.getModelOrigin();
  var cadWorkPlane = currentSection.getModelPlane().getTransposed();
  var cadEuler = cadWorkPlane.getEuler2(EULER_XYZ_S);
  defineLocalVariable(1, abcFormat.format(cadEuler.x));
  defineLocalVariable(2, abcFormat.format(cadEuler.y));
  defineLocalVariable(3, abcFormat.format(cadEuler.z));
  defineLocalVariable(4, xyzFormat.format(-cadOrigin.x));
  defineLocalVariable(5, xyzFormat.format(-cadOrigin.y));
  defineLocalVariable(6, xyzFormat.format(-cadOrigin.z));
  writeln(
    "DPRNT[G331" +
    "*N" + getPointNumber() +
    formatLocalVariable("*A", 1, macroRoundingFormat) +
    formatLocalVariable("*B", 2, macroRoundingFormat) +
    formatLocalVariable("*C", 3, macroRoundingFormat) +
    formatLocalVariable("*X", 4, macroRoundingFormat) +
    formatLocalVariable("*Y", 5, macroRoundingFormat) +
    formatLocalVariable("*Z", 6, macroRoundingFormat) +
    "]"
  );
}

function inspectionWriteWorkplaneTransform() {
  var orientation = machineConfiguration.isMultiAxisConfiguration() ? machineConfiguration.getOrientation(getCurrentDirection()) : currentSection.workPlane;
  var abc = orientation.getEuler2(EULER_XYZ_S);
  if (getProperty("useLiveConnection")) {
    liveConnectorInterface("WORKPLANE");
    writeln(inspectionVariables.liveConnectionWPA + " = " + abcFormat.format(abc.x));
    writeln(inspectionVariables.liveConnectionWPB + " = " + abcFormat.format(abc.y));
    writeln(inspectionVariables.liveConnectionWPC + " = " + abcFormat.format(abc.z));
    writeBlock("IF [" + inspectionVariables.workplaneStartAddress, "NE -1] GOTO" + skipNLines(2));
    writeBlock(inspectionVariables.workplaneStartAddress, "=", inspectionGetToolpathId(currentSection));
    writeBlock(" "); // do not remove, required for GOTO functionality
  }

  defineLocalVariable(1, abcFormat.format(abc.x));
  defineLocalVariable(2, abcFormat.format(abc.y));
  defineLocalVariable(3, abcFormat.format(abc.z));
  writeln("DPRNT[G330" +
    "*N" + getPointNumber() +
    formatLocalVariable("*A", 1, macroRoundingFormat) +
    formatLocalVariable("*B", 2, macroRoundingFormat) +
    formatLocalVariable("*C", 3, macroRoundingFormat) +
    "*X0*Y0*Z0*I0*R0]"
  );
}

function writeProbingToolpathInformation(cycleDepth) {
  // OWG v3_5: Sanitize DPRNT output to prevent syntax alarms on C00
  writeln("DPRNT[TOOLPATHID*" + sanitizeDPRNT(inspectionGetToolpathId(currentSection)) + "]");
  if (isInspectionOperation()) {
    writeln("DPRNT[TOOLPATH*" + sanitizeDPRNT(getParameter("operation-comment")) + "]");
  } else {
    defineLocalVariable(2, xyzFormat.format(cycleDepth));
    writeln(formatLocalVariable("DPRNT[CYCLEDEPTH*", 2, macroRoundingFormat + "]"));
  }
}
// <<<<< INCLUDED FROM include_files/commonInspectionFunctions_fanuc.cpi
// >>>>> INCLUDED FROM include_files/setProbeAngle_fanuc.cpi
function setProbeAngle() {
  if (probeVariables.outputRotationCodes) {
    var probeAngleVariables = settings.probing.probeAngleVariables[getProperty("probingType", "Renishaw")];
    validate(probeAngleVariables, localize("Setting 'probing.probeAngleVariables' is required for angular probing."));
    var px = probeAngleVariables.x;
    var py = probeAngleVariables.y;
    var pz = probeAngleVariables.z;
    var pi = probeAngleVariables.i;
    var pj = probeAngleVariables.j;
    var pk = probeAngleVariables.k;
    var pr = probeAngleVariables.r;
    var baseParamG54x4 = probeAngleVariables.baseParamG54x4;
    var baseParamAxisRot = probeAngleVariables.baseParamAxisRot;
    var probeOutputWorkOffset = currentSection.probeWorkOffset;

    validate(probeOutputWorkOffset <= 6, "Angular Probing only supports work offsets 1-6.");
    if (probeVariables.probeAngleMethod == "G68" && (Vector.diff(currentSection.getGlobalInitialToolAxis(), new Vector(0, 0, 1)).length > 1e-4)) {
      error(localize("You cannot use multi axis toolpaths while G68 Rotation is in effect."));
    }
    var validateWorkOffset = false;
    switch (probeVariables.probeAngleMethod) {
    case "G54.4":
      var param = baseParamG54x4 + (probeOutputWorkOffset * 10);
      writeBlock("#" + param + "=" + px);
      writeBlock("#" + (param + 1) + "=" + py);
      writeBlock("#" + (param + 5) + "=" + pr);
      writeBlock(gFormat.format(54.4), "P" + probeOutputWorkOffset);
      break;
    case "G68":
      gRotationModal.reset();
      gAbsIncModal.reset();
      var xy = probeVariables.compensationXY || formatWords(formatCompensationParameter("X", px), formatCompensationParameter("Y", py));
      writeBlock(
        gRotationModal.format(68), gAbsIncModal.format(90),
        xy,
        formatCompensationParameter("Z", pz),
        formatCompensationParameter("I", pi),
        formatCompensationParameter("J", pj),
        formatCompensationParameter("K", pk),
        formatCompensationParameter("R", pr)
      );
      validateWorkOffset = true;
      break;
    case "AXIS_ROT":
      var param = baseParamAxisRot + probeOutputWorkOffset * 20 + probeVariables.rotaryTableAxis + 4;
      writeBlock("#" + param + " = " + "[#" + param + " + " + pr + "]");
      forceWorkPlane(); // force workplane to rotate ABC in order to apply rotation offsets
      currentWorkOffset = undefined; // force WCS output to make use of updated parameters
      validateWorkOffset = true;
      break;
    default:
      error(localize("Angular Probing is not supported for this machine configuration."));
      return;
    }
    if (validateWorkOffset) {
      for (var i = currentSection.getId(); i < getNumberOfSections(); ++i) {
        if (getSection(i).workOffset != currentSection.workOffset) {
          error(localize("WCS offset cannot change while using angle rotation compensation."));
          return;
        }
      }
    }
    probeVariables.outputRotationCodes = false;
  }
}

function formatCompensationParameter(label, value) {
  return typeof value == "string" ? label + "[" + value + "]" : typeof value == "number" ? label + xyzFormat.format(value) : "";
}
// <<<<< INCLUDED FROM include_files/setProbeAngle_fanuc.cpi
// >>>>> INCLUDED FROM include_files/setProbeAngleMethod.cpi
function setProbeAngleMethod() {
  var probeAngleVariables = settings.probing.probeAngleVariables[getProperty("probingType", "Renishaw")];
  var axisRotIsSupported = false;
  var axes = [machineConfiguration.getAxisU(), machineConfiguration.getAxisV(), machineConfiguration.getAxisW()];
  for (var i = 0; i < axes.length; ++i) {
    if (axes[i].isEnabled() && isSameDirection((axes[i].getAxis()).getAbsolute(), new Vector(0, 0, 1)) && axes[i].isTable()) {
      axisRotIsSupported = true;
      if (probeAngleVariables.method == 0) { // Fanuc
        validate(i < 2, localize("Rotary table axis is invalid."));
        probeVariables.rotaryTableAxis = i;
      } else { // Haas
        probeVariables.rotaryTableAxis = axes[i].getCoordinate();
      }
      break;
    }
  }
  if (settings.probing.probeAngleMethod == undefined) {
    probeVariables.probeAngleMethod = axisRotIsSupported ? "AXIS_ROT" : getProperty("useG54x4") ? "G54.4" : "G68"; // automatic selection
  } else {
    probeVariables.probeAngleMethod = settings.probing.probeAngleMethod; // use probeAngleMethod from settings
    if (probeVariables.probeAngleMethod == "AXIS_ROT" && !axisRotIsSupported) {
      error(localize("Setting probeAngleMethod 'AXIS_ROT' is not supported on this machine."));
    }
  }
  probeVariables.outputRotationCodes = true;
}
// <<<<< INCLUDED FROM include_files/setProbeAngleMethod.cpi

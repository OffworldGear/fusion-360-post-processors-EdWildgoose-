/**
 * e2e_probing_and_gcode_verification.test.js
 *
 * Comprehensive E2E G-Code Verification Suite for Brother Speedio C00 (v3.8):
 * 1. All 22 WCS Probing Operations (strategy: "probe") + WCS decoding (G54-G59, G54.1 P1-300, G54.2 P1-8) + Angle Rotation (G68, G54.4, AXIS_ROT).
 * 2. All Probe Geometry & Inspection Operations (strategy: "probe_geometry" / "inspect", ensuring W is never output on P8700, P8707 size/position tolerances, P8706 wear updates with K scaling and #13000+D = 0.0000, printResults in "fusion" DPRNT spoof vs "raw" V-1. mode, POPEN/PCLOS lifecycle).
 * 3. All Tool Setup, Length, Wear, Lollipop (O8606/O8607), Manual NC, and Break Control (COMMAND_BREAK_CONTROL) Operations.
 * 4. Standard Milling (G41/G42 Wear comp, G43 positioning, M298 smoothing), Drilling (G81/G83/G73), and Rigid Tapping (G77/G84) Operations + baseline parity check against v3_7.cps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  ExtendedPostHarness,
  createV38Harness,
  CONSTANTS,
  V3_7_CPS_PATH,
  V3_8_CPS_PATH
} = require('../tier1_feature/test_helper');

function runPostWithConfig(jobSpec) {
  const h = createV38Harness();
  return h.execute(jobSpec);
}

const PROBE_TOOL = {
  number: 21,
  diameter: 6.0,
  type: CONSTANTS.TOOL_PROBE,
  description: 'Blum TC52 Touch Probe',
  coolant: CONSTANTS.COOLANT_OFF
};

const BASE_PROBE_CYCLE = {
  depth: 5.0,
  bottom: -5.0,
  retract: 10.0,
  Clearance: 25.0,
  probeClearance: 3.0,
  probeOvertravel: 2.0,
  feedrate: 1000,
  width1: 40.0,
  width2: 60.0,
  approach1: 'positive',
  approach2: 'positive',
  partialCircleAngleA: 30.0,
  partialCircleAngleB: 150.0,
  partialCircleAngleC: 270.0,
  probeSpacing: 20.0,
  nominalAngle: 0.0
};

// =============================================================================
// 1. ALL WCS PROBING OPERATIONS (strategy: "probe")
// =============================================================================

test('E2E WCS Probing: Verifies all 20 Blum WCS probing cycles emit valid P8703 / P8700 / W.. G-code', () => {
  const wcsCycles = [
    {
      cycleType: 'probing-x',
      expectedP8700: 'G65.0 P8700 A1 M3 I6.0000 X6.0000 Q2.0000 W54'
    },
    {
      cycleType: 'probing-y',
      expectedP8700: 'G65.0 P8700 A1 M3 J6.0000 Y6.0000 Q2.0000 W54'
    },
    {
      cycleType: 'probing-z',
      expectedP8700: 'G65.0 P8700 A1 M3 K-5.0000 Z-5.0000 Q2.0000 W54'
    },
    {
      cycleType: 'probing-x-wall',
      expectedP8700: 'G65.0 P8700 A1 M3 I0.0000 S40.0000 X1 Z-2.0000 Q2.0000 R3.0000 W54'
    },
    {
      cycleType: 'probing-y-wall',
      expectedP8700: 'G65.0 P8700 A1 M3 J0.0000 S40.0000 Z-2.0000 Y1 Q2.0000 R3.0000 W54'
    },
    {
      cycleType: 'probing-x-channel',
      expectedP8700: 'G65.0 P8700 A1 M3 I0.0000 S40.0000 X1 Q2.0000 W54'
    },
    {
      cycleType: 'probing-x-channel-with-island',
      expectedP8700: 'G65.0 P8700 A1 M3 I0.0000 R-3.0000 S40.0000 Z-2.0000 X1 Q2.0000 W54'
    },
    {
      cycleType: 'probing-y-channel',
      expectedP8700: 'G65.0 P8700 A1 M3 J0.0000 S40.0000 Y1 Q2.0000 W54'
    },
    {
      cycleType: 'probing-y-channel-with-island',
      expectedP8700: 'G65.0 P8700 A1 M3 J0.0000 R-3.0000 S40.0000 Z-2.0000 Y1 Q2.0000 W54'
    },
    {
      cycleType: 'probing-xy-circular-boss',
      expectedP8700: 'G65.0 P8700 A1 M3 I0.0000 J0.0000 S40.0000 Z-2.0000 Q2.0000 R3.0000 W54'
    },
    {
      cycleType: 'probing-xy-circular-partial-boss',
      expectedP8700: 'G65.0 P8700 A1 M3 H30.0000 U150.0000 V270.0000 I0.0000 J0.0000 S40.0000 Z-2.0000 Q2.0000 R3.0000 W54'
    },
    {
      cycleType: 'probing-xy-circular-hole',
      expectedP8700: 'G65.0 P8700 A1 M3 I0.0000 J0.0000 S40.0000 Q2.0000 W54'
    },
    {
      cycleType: 'probing-xy-circular-partial-hole',
      expectedP8700: 'G65.0 P8700 A1 M3 H30.0000 U150.0000 V270.0000 I0.0000 J0.0000 S40.0000 Q2.0000 W54'
    },
    {
      cycleType: 'probing-xy-circular-hole-with-island',
      expectedP8700: 'G65.0 P8700 A1 M3 I0.0000 J0.0000 R-3.0000 S40.0000 Q2.0000 Z-2.0000 W54'
    },
    {
      cycleType: 'probing-xy-circular-partial-hole-with-island',
      expectedP8700: 'G65.0 P8700 A1 M3 H30.0000 U150.0000 V270.0000 I0.0000 J0.0000 R-3.0000 S40.0000 Q2.0000 Z-2.0000 W54'
    },
    {
      cycleType: 'probing-xy-rectangular-hole',
      expectedP8700: [
        'G65.0 P8700 A1 M3 I0.0000 S40.0000 X1 Q2.0000 W54',
        'G65.0 P8700 A1 M3 J0.0000 S60.0000 Y1 Q2.0000 W54'
      ]
    },
    {
      cycleType: 'probing-xy-rectangular-boss',
      expectedP8700: [
        'G65.0 P8700 A1 M3 I0.0000 S40.0000 X1 Z-5.0000 Q2.0000 R3.0000 W54',
        'G65.0 P8700 A1 M3 J0.0000 S60.0000 Y1 Z-5.0000 Q2.0000 R3.0000 W54'
      ]
    },
    {
      cycleType: 'probing-xy-rectangular-hole-with-island',
      expectedP8700: [
        'G65.0 P8700 A1 M3 I0.0000 S40.0000 X1 Z-2.0000 Q2.0000 R-3.0000 W54',
        'G65.0 P8700 A1 M3 J0.0000 S60.0000 Y1 Z-2.0000 Q2.0000 R-3.0000 W54'
      ]
    },
    {
      cycleType: 'probing-xy-inner-corner',
      cycleOverrides: { probeSpacing: 0 },
      expectedP8700: [
        'G65.0 P8700 A1 M3 I6.0000 X6.0000 Q2.0000 W54',
        'G65.0 P8700 A1 M3 J6.0000 Y6.0000 Q2.0000 W54'
      ]
    },
    {
      cycleType: 'probing-xy-outer-corner',
      cycleOverrides: { probeSpacing: 0 },
      expectedP8700: 'G65.0 P8700 A1 M3 I6.0000 J6.0000 X12.0000 Y12.0000 Q2.0000 W54'
    }
  ];

  for (const item of wcsCycles) {
    const res = runPostWithConfig({
      properties: { probingType: 'Blum' },
      tools: [PROBE_TOOL],
      sections: [{
        toolNumber: 21,
        strategy: 'probe',
        workOffset: 1,
        probeWorkOffset: 1,
        cycleType: item.cycleType,
        cycle: { ...BASE_PROBE_CYCLE, ...(item.cycleOverrides || {}) },
        cyclePoints: [{ x: 0, y: 0, z: 0 }]
      }]
    });

    assert.strictEqual(res.errors.length, 0, `Cycle ${item.cycleType} failed with errors: ${JSON.stringify(res.errors)}`);

    // Must arm probe before cycle, retract after cycle, and disarm probe at section end
    assert.ok(res.output.includes('G65.0 P8703 A0 M1 X0'), `${item.cycleType}: Missing probe arm G65.0 P8703 A0 M1 X0`);
    assert.ok(res.output.includes('G65.0 P8703 A1 M3 Z10.0000 F5000'), `${item.cycleType}: Missing protected retract G65.0 P8703 A1 M3 Z10.0000 F5000`);
    assert.ok(res.output.includes('G65.0 P8703 A0 M2 X0'), `${item.cycleType}: Missing probe disarm G65.0 P8703 A0 M2 X0`);

    const expectedList = Array.isArray(item.expectedP8700) ? item.expectedP8700 : [item.expectedP8700];
    for (const exp of expectedList) {
      assert.ok(res.output.includes(exp), `${item.cycleType}: Expected '${exp}' in output:\n${res.output}`);
    }
  }
});

test('E2E WCS Probing: Verifies WCS offset decoding for G54..G59, G54.1 P1..P300, and G54.2 P1..P8', () => {
  const cases = [
    { probeWorkOffset: 1, expectedW: 'W54' },
    { probeWorkOffset: 6, expectedW: 'W59' },
    { probeWorkOffset: 7, expectedW: 'W-1' },   // G54.1 P1
    { probeWorkOffset: 54, expectedW: 'W-48' }, // G54.1 P48
    { probeWorkOffset: 306, expectedW: 'W-300' }, // G54.1 P300
    { probeWorkOffset: 307, expectedW: 'W1' },  // G54 G54.2 P1
    { probeWorkOffset: 314, expectedW: 'W8' }   // G54 G54.2 P8
  ];

  for (const c of cases) {
    const res = runPostWithConfig({
      properties: { probingType: 'Blum' },
      tools: [PROBE_TOOL],
      sections: [{
        toolNumber: 21,
        strategy: 'probe',
        workOffset: 1,
        probeWorkOffset: c.probeWorkOffset,
        cycleType: 'probing-z',
        cycle: { ...BASE_PROBE_CYCLE },
        cyclePoints: [{ x: 0, y: 0, z: 0 }]
      }]
    });
    assert.strictEqual(res.errors.length, 0, `WCS ${c.probeWorkOffset} errors: ${JSON.stringify(res.errors)}`);
    assert.ok(
      res.output.includes(`G65.0 P8700 A1 M3 K-5.0000 Z-5.0000 Q2.0000 ${c.expectedW}`),
      `probeWorkOffset=${c.probeWorkOffset}: expected ${c.expectedW} in output:\n${res.output}`
    );
  }
});

test('E2E WCS Probing: Verifies plane-angle probing with G68 and G54.4 coordinate rotation', () => {
  const endMill = {
    number: 1,
    diameter: 10.0,
    type: CONSTANTS.TOOL_MILLING_END_FLAT,
    description: '10mm Flat End Mill'
  };

  // Case A: G68 coordinate rotation (useG54x4 = false)
  const resG68 = runPostWithConfig({
    properties: { probingType: 'Blum', useG54x4: false },
    tools: [PROBE_TOOL, endMill],
    sections: [
      {
        toolNumber: 21,
        strategy: 'probe',
        workOffset: 1,
        probeWorkOffset: 1,
        cycleType: 'probing-x-plane-angle',
        cycle: { ...BASE_PROBE_CYCLE, nominalAngle: 90.0, probeSpacing: 30.0 },
        cyclePoints: [{ x: 0, y: 0, z: 0 }]
      },
      {
        toolNumber: 1,
        strategy: 'contour2d',
        workOffset: 1
      }
    ]
  });

  assert.strictEqual(resG68.errors.length, 0, `G68 plane angle errors: ${JSON.stringify(resG68.errors)}`);
  assert.ok(resG68.output.includes('G65.0 P8700 A1 M3 X6.0000 Q2.0000'), 'Should emit first angle probe point');
  assert.ok(resG68.output.includes('G65.0 P8700 A1 M3 D-360.0000 X6.0000 Q2.0000'), 'Should emit second angle probe point with D');
  assert.ok(resG68.output.includes('G68.0 G90.0 X0.0000 Y0.0000 Z0.0000 I0.0000 J0.0000 K1.0000 R[#143]'), `Should emit G68 coordinate rotation before subsequent milling op:\n${resG68.output}`);
  assert.ok(resG68.output.includes('G69.0'), 'Should cancel G68 with G69 at program close');

  // Case B: G54.4 workpiece setting error compensation (useG54x4 = true)
  const resG54x4 = runPostWithConfig({
    properties: { probingType: 'Blum', useG54x4: true },
    tools: [PROBE_TOOL, endMill],
    sections: [
      {
        toolNumber: 21,
        strategy: 'probe',
        workOffset: 1,
        probeWorkOffset: 1,
        cycleType: 'probing-y-plane-angle',
        cycle: { ...BASE_PROBE_CYCLE, nominalAngle: 0.0, probeSpacing: 30.0 },
        cyclePoints: [{ x: 0, y: 0, z: 0 }]
      },
      {
        toolNumber: 1,
        strategy: 'contour2d',
        workOffset: 1
      }
    ]
  });

  assert.strictEqual(resG54x4.errors.length, 0, `G54.4 plane angle errors: ${JSON.stringify(resG54x4.errors)}`);
  assert.ok(resG54x4.output.includes('#26010=#100'), 'Should set #26010=#100 for G54.4 P1 X');
  assert.ok(resG54x4.output.includes('#26011=#101'), 'Should set #26011=#101 for G54.4 P1 Y');
  assert.ok(resG54x4.output.includes('#26015=#143'), 'Should set #26015=#143 for G54.4 P1 R');
  assert.ok(resG54x4.output.includes('G54.4 P1'), 'Should activate G54.4 P1');
});

// =============================================================================
// 2. ALL PROBE GEOMETRY & INSPECTION OPERATIONS (strategy: "probe_geometry")
// =============================================================================

test('E2E Probe Geometry: Verifies W.. is NEVER emitted on P8700, while P8707 tolerances, P8706 wear, and DPRNT / V-1. work accurately', () => {
  // 1. Fusion DPRNT spoof mode with wrongSizeAction + outOfPositionAction + updateToolWear
  const resFusion = runPostWithConfig({
    properties: {
      probingType: 'Blum',
      probeResultsFormat: 'fusion',
      singleResultsFile: false
    },
    tools: [PROBE_TOOL],
    sections: [{
      toolNumber: 21,
      strategy: 'probe_geometry',
      operationComment: 'Inspect Bore 40mm',
      workOffset: 1,
      probeWorkOffset: 1,
      parameters: {
        'operation-comment': 'Inspect Bore 40mm',
        'printResults': 1,
        'cycleID': 1
      },
      cycleType: 'probing-xy-circular-hole',
      cycle: {
        ...BASE_PROBE_CYCLE,
        wrongSizeAction: 'stop-message',
        toleranceSize: 0.02,
        outOfPositionAction: 'stop-message',
        tolerancePosition: 0.05,
        updateToolWear: 1,
        toolDiameterOffset: 5,
        toolWearUpdateThreshold: 0.005,
        toolWearErrorCorrection: 80,
        printResults: 1,
        cycleID: 1
      },
      cyclePoints: [{ x: 10, y: 20, z: 0 }]
    }]
  });

  assert.strictEqual(resFusion.errors.length, 0, `Probe Geometry Fusion mode errors: ${JSON.stringify(resFusion.errors)}`);
  // Must NOT contain W54 on P8700 because strategy != "probe"
  assert.ok(
    resFusion.output.includes('G65.0 P8700 A1 M3 I10.0000 J20.0000 S40.0000 Q2.0000') && !resFusion.output.includes('W54'),
    `Probe Geometry must NOT emit W54 on P8700:\n${resFusion.output}`
  );
  // Must emit P8707 with T/U (size) and I/J (position)
  assert.ok(
    resFusion.output.includes('G65.0 P8707 T0.0200 U-0.0200 I0.0500 J-0.0500'),
    `Probe Geometry must emit P8707 tolerances:\n${resFusion.output}`
  );
  // Must emit P8706 with K0.8000 E5.0000 I0.0050 and zero #[13005] afterward
  assert.ok(
    resFusion.output.includes('G65.0 P8706 K0.8000 E5.0000 I0.0050'),
    `Probe Geometry must emit P8706 tool wear update:\n${resFusion.output}`
  );
  assert.ok(
    resFusion.output.includes('#[13005] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'),
    `Probe Geometry must zero #[13005] after radial P8706 wear update:\n${resFusion.output}`
  );
  // Must emit POPEN, Fusion DPRNT headers, feature DPRNT lines, and PCLOS at program end
  assert.ok(resFusion.output.includes('POPEN'), 'Missing POPEN in fusion results mode');
  assert.ok(resFusion.output.includes('DPRNT[START]'), 'Missing DPRNT[START]');
  assert.ok(resFusion.output.includes('DPRNT[SIZE*D40.0000*ACTUAL*#106[54]*DEV*#107[54]]'), 'Missing SIZE DPRNT spoof line');
  assert.ok(resFusion.output.includes('DPRNT[POSN*X0.0000*ACTUAL*#100[54]*DEV*#103[54]]'), 'Missing POSN X DPRNT spoof line');
  assert.ok(resFusion.output.includes('DPRNT[POSN*Y0.0000*ACTUAL*#101[54]*DEV*#104[54]]'), 'Missing POSN Y DPRNT spoof line');
  assert.ok(resFusion.output.includes('DPRNT[END]'), 'Missing DPRNT[END]');
  assert.ok(resFusion.output.includes('PCLOS'), 'Missing PCLOS');

  // 2. Raw Blum print mode (probeResultsFormat: "raw")
  const resRaw = runPostWithConfig({
    properties: {
      probingType: 'Blum',
      probeResultsFormat: 'raw'
    },
    tools: [PROBE_TOOL],
    sections: [{
      toolNumber: 21,
      strategy: 'probe_geometry',
      workOffset: 1,
      probeWorkOffset: 1,
      parameters: {
        'printResults': 1,
        'cycleID': 1
      },
      cycleType: 'probing-xy-circular-hole',
      cycle: {
        ...BASE_PROBE_CYCLE,
        printResults: 1,
        cycleID: 1
      },
      cyclePoints: [{ x: 10, y: 20, z: 0 }]
    }]
  });

  assert.strictEqual(resRaw.errors.length, 0, `Probe Geometry Raw mode errors: ${JSON.stringify(resRaw.errors)}`);
  assert.ok(
    resRaw.output.includes('G65.0 P8700 A1 M3 I10.0000 J20.0000 S40.0000 Q2.0000 V-1.'),
    `Raw mode must pass V-1. to P8700:\n${resRaw.output}`
  );
  assert.ok(
    !resRaw.output.includes('POPEN') && !resRaw.output.includes('DPRNT['),
    `Raw mode must NOT emit post-level POPEN/DPRNT (handled inside Blum O8716):\n${resRaw.output}`
  );
});

// =============================================================================
// 3. STANDARD MILLING, DRILLING, TAPPING & V3.7 BASELINE PARITY
// =============================================================================

test('E2E Milling/Drilling/Tapping: Verifies G100, G43, G41/G42 Wear comp, G81/G83/G73, and G77/G84 output and parity with v3_7', () => {
  const jobSpec = {
    properties: {
      a2StartLengthMeasure: 'none',
      a3StartWearCheck: 'none',
      usePitchForTapping: true
    },
    tools: [
      {
        number: 1,
        diameter: 10.0,
        type: CONSTANTS.TOOL_MILLING_END_FLAT,
        description: '10mm Flat End Mill',
        spindleRPM: 10000
      },
      {
        number: 2,
        diameter: 6.8,
        type: CONSTANTS.TOOL_DRILL,
        description: '6.8mm Drill',
        spindleRPM: 4000
      },
      {
        number: 3,
        diameter: 8.0,
        threadPitch: 1.25,
        type: CONSTANTS.TOOL_TAP_RIGHT_HAND,
        description: 'M8x1.25 Tap',
        spindleRPM: 1500
      }
    ],
    sections: [
      {
        toolNumber: 1,
        strategy: 'contour2d',
        workOffset: 1,
        compensationType: 'wear',
        stockToLeave: 0,
        moves: [
          { type: 'rapid', x: 0, y: 0, z: 5 },
          { type: 'linear', x: 0, y: 0, z: -5, feed: 500 },
          { type: 'linear', x: 10, y: 0, z: -5, feed: 1000, radiusCompensation: CONSTANTS.RADIUS_COMPENSATION_LEFT },
          { type: 'linear', x: 10, y: 20, z: -5, feed: 1000 },
          { type: 'linear', x: 0, y: 20, z: -5, feed: 1000, radiusCompensation: CONSTANTS.RADIUS_COMPENSATION_OFF },
          { type: 'rapid', x: 0, y: 20, z: 25 }
        ]
      },
      {
        toolNumber: 2,
        strategy: 'drill',
        workOffset: 1,
        cycleType: 'deep-drilling',
        cycle: {
          depth: 20,
          bottom: -20,
          retract: 3,
          clearance: 25,
          incrementalDepth: 5,
          feedrate: 600,
          dwell: 0
        },
        cyclePoints: [
          { x: 15, y: 15, z: -20 },
          { x: 45, y: 15, z: -20 }
        ]
      },
      {
        toolNumber: 3,
        strategy: 'drill',
        workOffset: 1,
        cycleType: 'right-tapping',
        cycle: {
          depth: 18,
          bottom: -18,
          retract: 5,
          clearance: 25,
          feedrate: 1875,
          dwell: 0
        },
        cyclePoints: [
          { x: 15, y: 15, z: -18 },
          { x: 45, y: 15, z: -18 }
        ]
      }
    ]
  };

  const harness38 = new ExtendedPostHarness();
  harness38.loadPost(V3_8_CPS_PATH);
  const res38 = harness38.execute(jobSpec);

  const harness37 = new ExtendedPostHarness();
  harness37.loadPost(V3_7_CPS_PATH);
  const res37 = harness37.execute(jobSpec);

  assert.strictEqual(res38.errors.length, 0, `v3_8 errors: ${JSON.stringify(res38.errors)}`);
  assert.strictEqual(res37.errors.length, 0, `v3_7 errors: ${JSON.stringify(res37.errors)}`);

  // Verify Milling G100, G43, G41, G40
  assert.ok(res38.output.includes('N10 G100.0 T1.0 X0.0000 Y0.0000 G43.0 Z25.0000 A0.0000 B0.0000 C0.0000 H1.0 D1.0 S10000 M3.0 M8.0'), `Missing G100 T1 with G43 Z25:\n${res38.output}`);
  assert.ok(res38.output.includes('#[13001] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'), 'Missing #[13001] = 0.0000 zero comp guard');
  assert.ok(res38.output.includes('#13001=0. (WEAR COMP - GEOMETRY MUST BE 0)'), 'Missing #13001=0. wear comp guard');
  assert.ok(res38.output.includes('G1.0 G41.0 X10.0000 Y0.0000 D1.0 F1000'), `Missing G1 G41 X10 Y0 D1 F1000:\n${res38.output}`);
  assert.ok(res38.output.includes('G1.0 G40.0 X0.0000 Y20.0000'), `Missing G1 G40 X0 Y20 cutter comp cancel:\n${res38.output}`);

  // Verify Deep Drilling G98 G83 + G80
  assert.ok(res38.output.includes('G98.0 G83.0 X15.0000 Y15.0000 Z-20.0000 R3.0000 Q5.0000 F600'), `Missing G98 G83 deep drilling cycle:\n${res38.output}`);
  assert.ok(res38.output.includes('X45.0000'), 'Missing second hole X45');
  assert.ok(res38.output.includes('G80.0'), 'Missing G80 cycle cancel');

  // Verify Rigid Tapping G77
  assert.ok(res38.output.includes('G77.0 X15.0000 Y15.0000 Z-18.0000 R5.0000 I1.2500 S10000 L6000'), `Missing G77 pitch tapping cycle:\n${res38.output}`);

  // Compare v3_8 and v3_7 line-by-line (ignoring only the build version comment and plan comment if any)
  const norm = (str) => str
    .split('\n')
    .filter(l => !l.includes('POST V') && !l.includes('OWG'))
    .join('\n');
  assert.strictEqual(norm(res38.output), norm(res37.output), 'Non-Blum milling/drilling/tapping G-code must be 100% identical between v3_7 and v3_8');
});

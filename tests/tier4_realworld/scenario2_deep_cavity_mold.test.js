/**
 * scenario2_deep_cavity_mold.test.js - Tier 4: Scenario 2 Deep Cavity Mold with Undercuts
 *
 * Simulates high-precision machining of a deep cavity injection mold with undercut features:
 * 1. T01 12mm Flat End Mill roughs main cavity
 * 2. T05 8mm Spherical Lollipop cutter (shank 4mm, neck 3.2mm) finishes undercut ribs with O8606 B-1.0
 * 3. Wear update across configurable arc angles I20.0 to K140.0 (extending into upper hemisphere)
 * 4. Verifies Blum O8606 B-1.0 least-squares wear fit with #115 nominal radius pass
 * 5. T06 8mm Lollipop (tagged [LASER SCAN]) executes Blum O8607 spherical contour scan across I20.0 to K140.0
 * 6. Validates zero-comp invariants throughout the job
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('Scenario 2: Deep Cavity Mold with Undercuts (Lollipop Wear & Contour Scan)', () => {
  const harness = createV38Harness();

  const t1Rougher = {
    number: 1,
    diameter: 12.0,
    flutes: 4,
    description: '12mm Roughing Mill',
    type: CONSTANTS.TOOL_MILLING_END_FLAT,
    spindleRPM: 7500
  };

  const t5Lollipop = {
    number: 5,
    diameter: 8.0,
    flutes: 4,
    description: '8mm Spherical Lollipop Finish',
    type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
    neckDiameter: 3.2,
    spindleRPM: 9500
  };

  const t6LollipopScan = {
    number: 6,
    diameter: 8.0,
    flutes: 4,
    description: '8mm Spherical Lollipop Inspection Scan',
    type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
    neckDiameter: 3.2,
    spindleRPM: 9500,
    comment: '[LASER SCAN]'
  };

  const job = {
    programName: 8002,
    programComment: 'DEEP CAVITY MOLD WITH UNDERCUTS',
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all',
      b5LollipopStartAngle: 20.0,
      b5LollipopEndAngle: 140.0
    },
    tools: [t1Rougher, t5Lollipop, t6LollipopScan],
    sections: [
      // Op 1: Roughing cavity
      {
        toolNumber: 1,
        spindleSpeed: 7500,
        feedrate: 1500,
        operationComment: 'Rough Cavity Pocket',
        stockToLeave: 0.3
      },
      // Op 2: Semi-finish undercut ribs
      {
        toolNumber: 5,
        spindleSpeed: 9500,
        feedrate: 1200,
        operationComment: 'Semi-Finish Undercut Ribs',
        stockToLeave: 0.15
      },
      // Op 3: Final Finish with wear update (O8606 B-1.0)
      {
        toolNumber: 5,
        spindleSpeed: 9500,
        feedrate: 1000,
        operationComment: 'Finish Undercut Contours [WEAR]',
        compensationType: 'wear',
        stockToLeave: 0.0,
        opUpdateWearBefore: true
      },
      // Op 4: Full spherical contour scan verification (O8607)
      {
        toolNumber: 6,
        spindleSpeed: 9500,
        feedrate: 1000,
        operationComment: 'Scan Lollipop Envelope',
        opUpdateWearBefore: true
      }
    ]
  };

  const res = harness.execute(job);

  assert.strictEqual(res.errors.length, 0, `Execution errors: ${JSON.stringify(res.errors)}`);
  const gcode = res.output;

  // 1. Program start guards
  assert.ok(gcode.includes('#13001=0.'));
  assert.ok(gcode.includes('#13005=0.'));
  assert.ok(gcode.includes('#13006=0.'));

  // 2. Op 3: Lollipop wear update via Blum O8606 B-1.0
  assert.ok(
    gcode.includes('P8606') && gcode.includes('B-1.'),
    'Must execute O8606 B-1.0 wear update for lollipop'
  );
  assert.ok(gcode.includes('I20.0') && gcode.includes('K140.0'));
  assert.ok(gcode.includes('J4.0')); // D/2 = 4.0
  assert.ok(gcode.includes('#115 = 4.0000 (RADIUS POSTPROCESSOR DATA)'));
  assert.ok(gcode.includes('#[13005] = 0.0000'));

  // 3. Op 4: Lollipop spherical contour scan via Blum O8607
  assert.ok(
    gcode.includes('P8607'),
    'Must execute O8607 contour scan for lollipop tool tagged [LASER SCAN]'
  );
  assert.ok(gcode.includes('I20.0') && gcode.includes('K140.0') && gcode.includes('J4.0'));

  // 4. Invariants
  assertZeroCompInvariants(gcode, [1, 5, 6]);
});

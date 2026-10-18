/**
 * scenario4_large_facemill.test.js - Tier 4: Scenario 4 Large Face Mill (>24mm) & In-Cycle Wear
 *
 * Simulates cast iron heavy machining combining oversized face mills with standard tooling:
 * 1. T01 50mm 5-insert Face Mill (> 24mm aperture limit) automatically falls back to Z-Nano
 *    with radius offset R25.0 to measure insert tip safely
 * 2. T02 12mm 4-flute End Mill measured on Blum Laser NT (O6008 B-3.0)
 * 3. Op 3 executes in-cycle Laser Wear Update (O6009 B-1.0) before critical finishing cut
 * 4. Verifies cutter comp guards and zero-comp invariant across the entire job
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('Scenario 4: Large Face Mill (>24mm) with Z-Nano and In-Cycle Finishing Wear', () => {
  const harness = createV38Harness();

  const t1FaceMill = {
    number: 1,
    diameter: 50.0,
    flutes: 5,
    type: CONSTANTS.TOOL_MILLING_FACE,
    description: '50mm Octagonal Face Mill',
    spindleRPM: 3500
  };

  const t2EndMill = {
    number: 2,
    diameter: 12.0,
    flutes: 4,
    type: CONSTANTS.TOOL_MILLING_END_FLAT,
    description: '12mm Finishing End Mill',
    spindleRPM: 8000
  };

  const job = {
    programName: 8004,
    programComment: 'LARGE FACE MILL AND FINISHING POCKET',
    properties: {
      a1LengthMethod: 'laser', // Requested laser as default
      a2StartLengthMeasure: 'all',
      measureToolMaxDiameter: 24.0, // Face mill radius offset threshold
      measureAllFlutes: false
    },
    tools: [t1FaceMill, t2EndMill],
    sections: [
      // Op 1: Face milling top surface with 50mm cutter
      {
        toolNumber: 1,
        spindleSpeed: 3500,
        feedrate: 2000,
        operationComment: 'Face Mill Top Deck',
        stockToLeave: 0.0
      },
      // Op 2: Pocket roughing with 12mm cutter
      {
        toolNumber: 2,
        spindleSpeed: 7500,
        feedrate: 1600,
        operationComment: 'Rough Center Pocket',
        stockToLeave: 0.2
      },
      // Op 3: Critical finish with in-cycle wear update
      {
        toolNumber: 2,
        spindleSpeed: 8000,
        feedrate: 1200,
        operationComment: 'Finish Pocket Walls [WEAR]',
        compensationType: 'wear',
        stockToLeave: 0.0,
        opUpdateWearBefore: true
      }
    ]
  };

  const res = harness.execute(job);

  assert.strictEqual(res.errors.length, 0, `Execution errors: ${JSON.stringify(res.errors)}`);
  const gcode = res.output;

  // 1. Start length measurement:
  // T01 (50mm > 24mm) must bypass laser and measure on Z-Nano with radius offset R25.0
  assert.ok(
    gcode.includes('P8915') && gcode.includes('T1.0') && (gcode.includes('R25.0') || gcode.includes('R25.')),
    '50mm Face Mill must measure on Z-Nano P8915 with radius offset R25.'
  );

  // T02 (12mm <= 24mm) must measure on Laser NT O6008 B-3.0
  assert.ok(
    gcode.includes('P6008') && gcode.includes('T2.0000') && gcode.includes('B-3.'),
    '12mm End Mill must measure on Laser NT P6008 B-3.0'
  );

  // 2. Op 3: In-cycle wear update for T02
  assert.ok(
    gcode.includes('P6009 B-1.0000 T2.0000'),
    'Op 3 must execute in-cycle wear update P6009 B-1.0 on tool 2'
  );

  // 3. Pre-wear comp guard on Op 3
  assert.ok(gcode.includes('#13002=0. (WEAR COMP - GEOMETRY MUST BE 0)'));
  assert.ok(gcode.includes('IF [ABS[#12002] LE 0.1000] GOTO 90004'));

  // 4. Invariants
  assertZeroCompInvariants(gcode, [1, 2]);
});

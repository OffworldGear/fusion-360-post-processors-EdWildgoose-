/**
 * scenario1_aerospace_bracket.test.js - Tier 4: Scenario 1 Aerospace Bracket Production Test
 *
 * Simulates multi-operation machining of a titanium aerospace bracket:
 * 1. Op 1: Roughing with T01 (16mm 3-flute End Mill, Laser NT length check)
 * 2. Op 2: Semi-Finishing with T02 (10mm 4-flute End Mill, 0.25mm stock)
 * 3. Op 3: Final Wall Finishing with T02 (10mm End Mill, Wear comp G41, stock 0.0mm,
 *          a3bAutoWearBeforeFinish auto-triggers O6009 B-1.0 wear update)
 * 4. Op 4: Bottom Face Finishing with T02 (Wear comp G41, stock 0.0mm)
 * 5. Break Control: End-of-operation break detection on T02 calls O6009 B-2.0 (Check-Only)
 * 6. Validates zero-comp invariant (#13001=0, #13002=0) throughout the entire job
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('Scenario 1: Aerospace Bracket (Roughing + Finish + Wear Comp + Break Control)', () => {
  const harness = createV38Harness();

  const t1Rougher = {
    number: 1,
    diameter: 16.0,
    flutes: 3,
    description: '16mm Roughing End Mill',
    type: CONSTANTS.TOOL_MILLING_END_FLAT,
    spindleRPM: 6000,
    coolant: CONSTANTS.COOLANT_FLOOD
  };

  const t2Finisher = {
    number: 2,
    diameter: 10.0,
    flutes: 4,
    description: '10mm Finishing End Mill',
    type: CONSTANTS.TOOL_MILLING_END_FLAT,
    spindleRPM: 8500,
    coolant: CONSTANTS.COOLANT_FLOOD,
    breakControl: true
  };

  const job = {
    programName: 8001,
    programComment: 'AEROSPACE BRACKET PRODUCTION JOB',
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all',
      a3bAutoWearBeforeFinish: true,
      b2MaxDiameterWear: 0.05,
      b3LaserRunoutTolerance: 0.02
    },
    tools: [t1Rougher, t2Finisher],
    sections: [
      // Op 1: Roughing pocket
      {
        toolNumber: 1,
        spindleSpeed: 6000,
        feedrate: 1800,
        operationComment: 'Rough Pocket Cavity',
        stockToLeave: 0.5
      },
      // Op 2: Semi-finishing walls
      {
        toolNumber: 2,
        spindleSpeed: 8500,
        feedrate: 1400,
        operationComment: 'Semi-Finish Wall Contour',
        stockToLeave: 0.25
      },
      // Op 3: Final Wall Finishing (triggers auto-wear update)
      {
        toolNumber: 2,
        spindleSpeed: 8500,
        feedrate: 1200,
        operationComment: 'Final Wall Finishing Pass',
        compensationType: 'wear',
        stockToLeave: 0.0
      },
      // Op 4: Bottom Face Finishing
      {
        toolNumber: 2,
        spindleSpeed: 8500,
        feedrate: 1200,
        operationComment: 'Final Floor Finishing Pass',
        compensationType: 'wear',
        stockToLeave: 0.0,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  };

  const res = harness.execute(job);

  assert.strictEqual(res.errors.length, 0, `Execution errors: ${JSON.stringify(res.errors)}`);
  const gcode = res.output;

  // 1. Program start safety guards
  assert.ok(gcode.includes('(OWG SAFETY GUARDS)'));
  assert.ok(gcode.includes('#13001=0.'));
  assert.ok(gcode.includes('#13002=0.'));

  // 2. Start-of-program length measurement
  assert.ok(gcode.includes('P6008 B-3.0000 T1.0000'));
  assert.ok(gcode.includes('P6008 B-3.0000 T2.0000'));

  // 3. Op 1 Roughing: tool change G100 T1 with zero comp
  assert.ok(gcode.includes('G100.0 T1.0') && gcode.includes('#[13001] = 0.0000'));

  // 4. Op 2 Semi-finishing: tool change G100 T2 with zero comp (no wear update since stock > 0)
  assert.ok(gcode.includes('G100.0 T2.0') && gcode.includes('#[13002] = 0.0000'));

  // 5. Op 3 Final Finish: auto-detected wear finishing pass
  const op3WearIdx = gcode.indexOf('(BLUM LASER NT WEAR AND RUNOUT MEASUREMENT O6009 B-1.0)');
  assert.ok(op3WearIdx !== -1, 'Must execute Laser Wear Update O6009 B-1.0 before final finishing pass');
  assert.ok(gcode.includes('P6009 B-1.0000 T2.0000'));

  // 6. Pre-wear comp guard on Op 3
  assert.ok(gcode.includes('#13002=0. (WEAR COMP - GEOMETRY MUST BE 0)'));
  assert.ok(gcode.includes('IF [ABS[#12002] LE 0.0500] GOTO 90004'));

  // 7. Op 4 Break Control: calls O6009 B-2.0 Check-Only mode
  const op4BreakIdx = gcode.indexOf('(BLUM LASER NT CHECK-ONLY MODE O6009 B-2.0)');
  assert.ok(op4BreakIdx !== -1, 'End-of-op break check must execute O6009 B-2.0');
  assert.ok(gcode.includes('P6009 B-2.0000 T2.0000'));

  // 8. Invariants
  assertZeroCompInvariants(gcode, [1, 2]);
});

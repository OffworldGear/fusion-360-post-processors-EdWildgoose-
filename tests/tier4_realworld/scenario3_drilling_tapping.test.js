/**
 * scenario3_drilling_tapping.test.js - Tier 4: Scenario 3 High-Volume Drilling & Tapping
 *
 * Simulates high-speed production holemaking on Brother Speedio C00:
 * 1. T01: 90 deg Spot Drill (chamfering & centering)
 * 2. T02: 6.8mm Carbide Twist Drill (peck drilling with Break Control enabled)
 * 3. Break Control: Emits spindle M3 S3000, M159, G4 X1.5 settle dwell,
 *    and G65 P8608 with geom.x offset for centric tool breakage detection, then stops spindle
 * 4. T03: M8x1.25 Form Tap (rigid synchronized tapping)
 * 5. Validates zero-comp invariants across all operations
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('Scenario 3: High-Volume Drilling & Tapping (Centric Break Control via P8608)', () => {
  const harness = createV38Harness();

  const t1SpotDrill = {
    number: 1,
    diameter: 6.0,
    type: CONSTANTS.TOOL_DRILL_SPOT,
    taperAngle: Math.PI / 4, // 45 deg half-angle = 90 deg included
    description: '6mm 90deg Spot Drill',
    spindleRPM: 6000
  };

  const t2Drill = {
    number: 2,
    diameter: 6.8,
    type: CONSTANTS.TOOL_DRILL,
    description: '6.8mm M8 Tap Drill',
    spindleRPM: 5500,
    breakControl: true // Trigger end-of-op break check
  };

  const t3Tap = {
    number: 3,
    diameter: 8.0,
    threadPitch: 1.25,
    type: CONSTANTS.TOOL_TAP_RIGHT_HAND,
    description: 'M8x1.25 Machine Tap',
    spindleRPM: 1200
  };

  const job = {
    programName: 8003,
    programComment: 'HIGH-VOLUME DRILLING AND TAPPING CELL',
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all',
      b4ToolBreakageTolerance: 0.04
    },
    tools: [t1SpotDrill, t2Drill, t3Tap],
    sections: [
      // Op 1: Spot drilling
      {
        toolNumber: 1,
        spindleSpeed: 6000,
        feedrate: 350,
        operationComment: 'Spot Drill Holes'
      },
      // Op 2: Deep hole drilling with break check
      {
        toolNumber: 2,
        spindleSpeed: 5500,
        feedrate: 450,
        operationComment: 'Drill M8 Tap Holes',
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      },
      // Op 3: Tapping holes
      {
        toolNumber: 3,
        spindleSpeed: 1200,
        feedrate: 1500,
        operationComment: 'Rigid Tap M8 Holes'
      }
    ]
  };

  const res = harness.execute(job);

  assert.strictEqual(res.errors.length, 0, `Execution errors: ${JSON.stringify(res.errors)}`);
  const gcode = res.output;

  // 1. Program header guards
  assert.ok(gcode.includes('#13001=0.'));
  assert.ok(gcode.includes('#13002=0.'));
  assert.ok(gcode.includes('#13003=0.'));

  // 2. Start-of-program length measurement
  assert.ok(gcode.includes('P6008') && gcode.includes('T1.0000'));
  assert.ok(gcode.includes('P6008') && gcode.includes('T2.0000'));
  assert.ok(gcode.includes('P6008') && gcode.includes('T3.0000'));

  // 3. End-of-op Break Control on Drill T02:
  // Must verify:
  // - Spindle started at M3 S3000
  // - M159 lookahead flush
  // - G4 X1.5 dwell
  // - G65 P8608 H2.0000 X[geom.x] M1. Q0.0400 W0.
  // - Spindle stopped with M5
  const breakCommentIdx = gcode.indexOf('(BLUM LASER NT TOOL BREAK DETECTION P8608)');
  assert.ok(breakCommentIdx !== -1, 'Must emit Blum Laser NT tool break detection comment');

  const afterBreakComment = gcode.substring(breakCommentIdx);
  assert.ok(afterBreakComment.includes('M3.0 S3000') || afterBreakComment.includes('M3 S3000'));
  assert.ok(afterBreakComment.includes('M159') || afterBreakComment.includes('M159.0'));
  assert.ok(afterBreakComment.includes('G4.0 X1.5') || afterBreakComment.includes('G4 X1.5'));
  assert.ok(afterBreakComment.includes('P8608') && afterBreakComment.includes('H2.0000'));
  assert.ok(afterBreakComment.includes('Q0.0400'));
  assert.ok(afterBreakComment.includes('M5.0') || afterBreakComment.includes('M5'));

  // 4. Zero comp restoration after break check
  assert.ok(afterBreakComment.includes('#[13002] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'));

  // 5. Invariants
  assertZeroCompInvariants(gcode, [1, 2, 3]);
});

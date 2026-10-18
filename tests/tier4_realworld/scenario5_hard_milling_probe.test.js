/**
 * scenario5_hard_milling_probe.test.js - Tier 4: Scenario 5 Hard Milling & Touch Probe Closed-Loop
 *
 * Simulates unattended closed-loop die-steel hard milling on Brother Speedio C00:
 * 1. T01 8mm Ball Nose semi-finishes die cavity
 * 2. T02 4mm Ball Nose executes finishing pass (Wear comp G41 with O6009 B-1.0 auto-wear update)
 * 3. T09 Blum Touch Probe inspects bore diameter and updates T02 diameter wear (P8706 K0.5 E2)
 * 4. Post-probing block immediately enforces ensureWearModeZeroComp(2)
 * 5. T02 executes re-machining spring pass reading updated wear from #[12002] while #[13002] remains 0.0000
 * 6. Validates zero-comp invariant across the entire production workflow
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('Scenario 5: Multi-Op Hard Milling with Touch Probe Closed-Loop Wear Update', () => {
  const harness = createV38Harness();

  const t1Ball8 = {
    number: 1,
    diameter: 8.0,
    type: CONSTANTS.TOOL_MILLING_END_BALL,
    description: '8mm Ball Nose Semi-Finish',
    spindleRPM: 9000
  };

  const t2Ball4 = {
    number: 2,
    diameter: 4.0,
    type: CONSTANTS.TOOL_MILLING_END_BALL,
    description: '4mm Ball Nose Die Finisher',
    spindleRPM: 12000,
    breakControl: true
  };

  const t9Probe = {
    number: 9,
    diameter: 6.0,
    type: CONSTANTS.TOOL_PROBE,
    description: 'Blum TC50 Spindle Probe'
  };

  const job = {
    programName: 8005,
    programComment: 'DIE-STEEL HARD MILLING WITH PROBE CLOSED LOOP',
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all',
      a3bAutoWearBeforeFinish: true,
      b2MaxDiameterWear: 0.05
    },
    tools: [t1Ball8, t2Ball4, t9Probe],
    sections: [
      // Op 1: Semi-finish die cavity
      {
        toolNumber: 1,
        spindleSpeed: 9000,
        feedrate: 1500,
        operationComment: 'Semi-Finish Die 3D Cavity',
        stockToLeave: 0.15
      },
      // Op 2: Final Finish pass (triggers auto-wear before cutting)
      {
        toolNumber: 2,
        spindleSpeed: 12000,
        feedrate: 1800,
        operationComment: 'Die Cavity 3D Finish Pass',
        compensationType: 'wear',
        stockToLeave: 0.0
      },
      // Op 3: In-process probe inspection updating T02 wear
      {
        toolNumber: 9,
        strategy: 'probe',
        probeWorkOffset: 1,
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 16.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          updateToolWear: true,
          toolWearErrorCorrection: 50, // 50% ratio -> K0.5
          toolDiameterOffset: 2 // Feed feedback into Tool 2
        }
      },
      // Op 4: Spring pass with T02 applying feedback wear
      {
        toolNumber: 2,
        spindleSpeed: 12000,
        feedrate: 1800,
        operationComment: 'Final Die Spring Pass with Updated Wear',
        compensationType: 'wear',
        stockToLeave: 0.0,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  };

  const res = harness.execute(job);

  assert.strictEqual(res.errors.length, 0, `Execution errors: ${JSON.stringify(res.errors)}`);
  const gcode = res.output;

  // 1. Program start zero-comp guards
  assert.ok(gcode.includes('#13001=0.'));
  assert.ok(gcode.includes('#13002=0.'));

  // 2. Op 2: Laser wear update for Ball Nose T02 (B-1.0, equator measurement at Z = D/2 = 2.0mm)
  assert.ok(
    gcode.includes('P6009 B-1.0000 T2.0000') && gcode.includes('Z2.0000'),
    'Ball nose T02 must measure wear at equator Z2.0000'
  );

  // 3. Op 3: Probe cycle updating Tool 2 wear
  assert.ok(
    gcode.includes('P8706 K0.5000 E2.0000'),
    'Probe cycle must call P8706 with K0.5000 scaling and E2.0000 target'
  );
  assert.ok(
    gcode.includes('#[13002] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'),
    'Post-probing block must enforce ensureWearModeZeroComp for tool 2'
  );

  // 4. Op 4: Spring pass checks updated wear in #[12002]
  assert.ok(gcode.includes('IF [ABS[#12002] LE 0.0500] GOTO 90004'));

  // 5. Op 4: End-of-op break check (Check-Only mode)
  assert.ok(gcode.includes('P6009 B-2.0000 T2.0000'));

  // 6. Invariants
  assertZeroCompInvariants(gcode, [1, 2]);
});

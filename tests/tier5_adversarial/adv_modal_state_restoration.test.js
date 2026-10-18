/**
 * adv_modal_state_restoration.test.js - Tier 5: Adversarial Modal State Restoration
 *
 * Attacks G-code modal state restoration after in-cycle Blum measuring cycles:
 * - Spindle speed & direction restoration (cutting RPM vs calibration S3000)
 * - Coolant re-engagement (M8, M7, through-spindle)
 * - Tool length compensation G43 H... re-activation after G49 cancellation
 * - Work coordinate system (WCS) re-assertion across G54/G55/G56 changes
 * - XY prepositioning and plunge safety after Z reference return
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  CONSTANTS,
  Vector
} = require('../tier1_feature/test_helper.js');

test('ADV5.1: Forensic Analysis: In-cycle wear check suppresses cutting RPM word due to unreset sOutput cache', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8501,
    tools: [
      {
        number: 4,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_END_FLAT,
        spindleRPM: 11500
      }
    ],
    sections: [
      {
        toolNumber: 4,
        spindleSpeed: 11500,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Find index of P6009
  const p6009Index = gcode.indexOf('P6009');
  assert.ok(p6009Index !== -1, 'Must contain P6009 laser wear check');

  // Verify that after Blum cycle, spindle restart M3.0 is emitted
  const afterBlum = gcode.substring(p6009Index);
  assert.ok(
    afterBlum.includes('M3.0'),
    'Spindle forward M3.0 must be commanded after Blum cycle'
  );

  // Fix verification: restoreModalStateAfterToolCheck resets sOutput cache via sOutput.reset()
  // so that startSpindle(tool, true) explicitly emits the cutting RPM (S11500) alongside M3.0
  const hasSpindleSpeedWord = afterBlum.includes('S11500');
  assert.strictEqual(
    hasSpindleSpeedWord,
    true,
    'Spindle speed S11500 must be explicitly commanded after in-cycle O6009 wear check'
  );
});

test('ADV5.2: Coolant is re-commanded after Blum cycle M9 coolant shutoff', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8502,
    tools: [
      {
        number: 5,
        diameter: 10.0,
        type: CONSTANTS.TOOL_MILLING_END_FLAT,
        coolant: CONSTANTS.COOLANT_FLOOD
      }
    ],
    sections: [
      {
        toolNumber: 5,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  const p6009Index = gcode.indexOf('P6009');
  assert.ok(p6009Index !== -1);
  const afterBlum = gcode.substring(p6009Index);

  // Must re-issue M8.0 after cycle
  assert.ok(
    afterBlum.includes('M8.0') || afterBlum.includes('M8'),
    'Coolant (M8) must be re-engaged after Blum cycle'
  );
});

test('ADV5.3: G43 H... tool length compensation is re-issued after G49 cancellation', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8503,
    tools: [
      {
        number: 6,
        diameter: 12.0,
        lengthOffset: 6,
        type: CONSTANTS.TOOL_MILLING_END_FLAT
      }
    ],
    sections: [
      {
        toolNumber: 6,
        opUpdateWearBefore: true,
        initialPosition: new Vector(50, 75, 10)
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  const p6009Index = gcode.indexOf('P6009');
  assert.ok(p6009Index !== -1);
  const afterBlum = gcode.substring(p6009Index);

  // Must contain G49 (modal reset cancellation)
  assert.ok(afterBlum.includes('G49.0') || afterBlum.includes('G49'));

  // And must re-assert G43 with H6.0
  assert.ok(
    afterBlum.includes('G43.0') && afterBlum.includes('H6.0'),
    'Must re-enable length compensation G43 H6 after G49 reset'
  );
});

test('ADV5.4: WCS transition with in-cycle wear update correctly re-establishes work offset', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8504,
    tools: [
      { number: 1, diameter: 10.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }
    ],
    sections: [
      {
        toolNumber: 1,
        workOffset: 1,
        wcs: 'G54',
        initialPosition: new Vector(0, 0, 20)
      },
      {
        toolNumber: 1,
        workOffset: 2,
        wcs: 'G55',
        opUpdateWearBefore: true,
        initialPosition: new Vector(100, 100, 20)
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify G54 and G55 presence
  assert.ok(gcode.includes('G54'), 'Must output G54 for first section');
  assert.ok(gcode.includes('G55'), 'Must output G55 for second section');

  // Verify that G55 is active for operation 2 motion after Blum cycle
  const op2Index = gcode.indexOf('(OPERATION 2)');
  assert.ok(op2Index !== -1);
  const op2Text = gcode.substring(op2Index);
  assert.ok(op2Text.includes('G55'), 'G55 must be active in operation 2');
});

test('ADV5.5: Multi-tool workflow with wear check and break control preserves modal safety throughout', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8505,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [
      { number: 1, diameter: 12.0, type: CONSTANTS.TOOL_MILLING_END_FLAT },
      { number: 2, diameter: 5.0, type: CONSTANTS.TOOL_DRILL }
    ],
    sections: [
      {
        toolNumber: 1,
        opUpdateWearBefore: true,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      },
      {
        toolNumber: 2,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Tool 1: in-cycle wear update (B-1.0) and break check (B-2.0)
  assert.ok(gcode.includes('P6009 B-1.0000 T1.0000'), 'Tool 1 must run wear update');
  assert.ok(gcode.includes('P6009 B-2.0000 T1.0000'), 'Tool 1 must run check-only break check');

  // Tool 2: centric drill break check (P8608 S3000 X0.)
  assert.ok(gcode.includes('P8608 H2.0000 X0.0000'), 'Tool 2 must run P8608 centric check');

  // Zero comp invariant must hold for both tools
  assert.ok(gcode.includes('#[13001] = 0.0000'));
  assert.ok(gcode.includes('#[13002] = 0.0000'));
});

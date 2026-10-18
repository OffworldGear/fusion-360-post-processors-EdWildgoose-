/**
 * f3_wear_update_vs_check.test.js - Tier 1: Feature 3 In-Cycle Wear Update (B-1.0) vs Check-Only (B-2.0)
 *
 * Verifies clean separation between Wear Updates (B-1.0, updating #[12000+T])
 * and Check-Only / Break Control (B-2.0, verifying condition without table write):
 * 1. opUpdateWearBefore (scope: operation) checkbox triggers O6009 B-1.0 before op
 * 2. a3bAutoWearBeforeFinish auto-detects Wear comp finishing passes (stockToLeave = 0)
 * 3. Operation comment tags [WEAR] / [UPDATE WEAR] trigger O6009 B-1.0
 * 4. Operation comment tag [CHECK] triggers O6009 B-2.0
 * 5. Manual NC ACTION_MEASURE_TOOL:WEAR vs MEASURE_TOOL:CHECK
 * 6. COMMAND_BREAK_CONTROL uses Check-Only B-2.0 for milling cutters
 * 7. In-cycle modal restoration restores spindle, coolant, G43, and zero comp
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('./test_helper.js');

test('F3.1: Operation checkbox opUpdateWearBefore triggers O6009 B-1.0 before operation', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3001,
    tools: [
      { number: 1, diameter: 10.0, description: '10mm Mill' }
    ],
    sections: [
      {
        toolNumber: 1,
        spindleSpeed: 8000,
        feedrate: 1000,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O6009 B-1.0 (Wear update)
  assert.ok(
    gcode.includes('P6009') && (gcode.includes('B-1.') || gcode.includes('B-1.0')),
    'opUpdateWearBefore must emit O6009 with B-1.0 wear update mode'
  );

  // Must restore spindle speed and coolant after check
  assert.ok(gcode.includes('M3') || gcode.includes('M3.0'));
  assert.ok(gcode.includes('M8') || gcode.includes('M8.0'));

  // Must emit G43 Z approach move after tool check
  assert.ok(gcode.includes('G43'));

  assertZeroCompInvariants(gcode, [1]);
});

test('F3.2: a3bAutoWearBeforeFinish auto-triggers O6009 B-1.0 on Wear comp + 0 stock', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3002,
    properties: {
      a3bAutoWearBeforeFinish: true
    },
    tools: [
      { number: 2, diameter: 6.0, description: '6mm End Mill' }
    ],
    sections: [
      {
        toolNumber: 2,
        spindleSpeed: 10000,
        feedrate: 1500,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must auto-trigger O6009 B-1.0
  assert.ok(
    gcode.includes('P6009') && (gcode.includes('B-1.') || gcode.includes('B-1.0')),
    'a3bAutoWearBeforeFinish must trigger O6009 B-1.0 for Wear comp with 0 stock'
  );

  assertZeroCompInvariants(gcode, [2]);
});

test('F3.3: Operation comment tag [WEAR] triggers O6009 B-1.0', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3003,
    tools: [
      { number: 3, diameter: 8.0, description: '8mm Mill' }
    ],
    sections: [
      {
        toolNumber: 3,
        spindleSpeed: 8000,
        feedrate: 1200,
        operationComment: 'Finish wall contour [WEAR]'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O6009 B-1.0
  assert.ok(
    gcode.includes('P6009') && (gcode.includes('B-1.') || gcode.includes('B-1.0')),
    '[WEAR] comment tag must trigger O6009 B-1.0'
  );

  assertZeroCompInvariants(gcode, [3]);
});

test('F3.4: Operation comment tag [CHECK] triggers O6009 B-2.0 Check-Only mode', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3004,
    tools: [
      { number: 4, diameter: 12.0, description: '12mm Mill' }
    ],
    sections: [
      {
        toolNumber: 4,
        spindleSpeed: 7000,
        feedrate: 1000,
        operationComment: 'Roughing pocket [CHECK]'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O6009 B-2.0 (Check-only)
  assert.ok(
    gcode.includes('P6009') && (gcode.includes('B-2.') || gcode.includes('B-2.0')),
    '[CHECK] comment tag must trigger O6009 B-2.0 Check-Only mode'
  );

  assertZeroCompInvariants(gcode, [4]);
});

test('F3.5: Manual NC MEASURE_TOOL actions dispatch WEAR and CHECK correctly', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3005,
    tools: [
      { number: 5, diameter: 10.0, description: '10mm Mill' }
    ],
    sections: [
      {
        toolNumber: 5,
        spindleSpeed: 8000,
        feedrate: 1000,
        actions: ['MEASURE_TOOL:WEAR', 'MEASURE_TOOL:CHECK']
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must contain both B-1.0 and B-2.0 calls
  assert.ok(gcode.includes('P6009 B-1.0000') || gcode.includes('P6009 B-1.'));
  assert.ok(gcode.includes('P6009 B-2.0000') || gcode.includes('P6009 B-2.'));

  assertZeroCompInvariants(gcode, [5]);
});

test('F3.6: COMMAND_BREAK_CONTROL uses Check-Only B-2.0 for milling cutters', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3006,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [
      {
        number: 6,
        diameter: 8.0,
        description: '8mm End Mill',
        type: CONSTANTS.TOOL_MILLING_END_FLAT,
        breakControl: true // Fusion Break control flag
      }
    ],
    sections: [
      {
        toolNumber: 6,
        spindleSpeed: 9000,
        feedrate: 1200,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // For milling cutter <= 24mm, break control must call O6009 B-2.0 (Check-Only)
  // so tool breakage and runout are tested without modifying #[12000+T] wear table
  assert.ok(
    gcode.includes('P6009') && (gcode.includes('B-2.') || gcode.includes('B-2.0')),
    'COMMAND_BREAK_CONTROL on milling cutter must call O6009 B-2.0 Check-Only'
  );

  assertZeroCompInvariants(gcode, [6]);
});

test('F3.7: In-cycle wear measurement restores spindle, coolant, G43, and zero comp', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3007,
    tools: [
      { number: 7, diameter: 10.0, description: '10mm Mill', spindleRPM: 8500, coolant: CONSTANTS.COOLANT_FLOOD }
    ],
    sections: [
      {
        toolNumber: 7,
        spindleSpeed: 8500,
        feedrate: 1100,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Find position of P6009
  const p6009Idx = gcode.indexOf('P6009');
  assert.ok(p6009Idx !== -1);
  const afterP6009 = gcode.substring(p6009Idx);

  // Spindle restart
  assert.ok(afterP6009.includes('M3'), 'Spindle must be restarted after O6009');
  // Coolant restart
  assert.ok(afterP6009.includes('M8'), 'Coolant must be restored after O6009');
  // Zero comp restoration
  assert.ok(
    afterP6009.includes('#[13007] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'),
    'Zero comp must be enforced after O6009'
  );
  // G43 length comp re-engagement
  assert.ok(afterP6009.includes('G43'), 'G43 height offset must be re-commanded');

  assertZeroCompInvariants(gcode, [7]);
});

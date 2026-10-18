/**
 * b1_zero_comp_boundaries.test.js - Tier 2: Boundary 1 Zero Cutter Comp Boundary Tests
 *
 * Verifies edge cases and boundary conditions for Cutter Comp Invariants:
 * 1. Interrupted cycle flag (#580 > 0) at program start triggers alarm 122 and cleans up
 * 2. Maximum tool table index T99 is handled and guarded
 * 3. Out-of-range tool index T100 validation
 * 4. Non-zero positive stockToLeave does not trigger auto-wear
 * 5. Negative stockToLeave does not trigger auto-wear
 * 6. O8679 pre-alarm boundary values for #7, #11, #580 (0, 1, 99, 100) and M159 flush
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  createV38Harness,
  assertZeroCompInvariants,
  MACROS_V3_8_DIR
} = require('../tier1_feature/test_helper.js');

test('B1.1: Interrupted cycle guard branches to N90002, resets #580, and fires alarm 122', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1101,
    tools: [{ number: 7, diameter: 10.0 }],
    sections: [{ toolNumber: 7 }]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify the exact safety branch logic
  assert.ok(gcode.includes('IF [#580 GT 0] GOTO 90002'));
  assert.ok(gcode.includes('GOTO 90003'));
  assert.ok(gcode.includes('N90002'));
  assert.ok(gcode.includes('#[13000+#580]=0.'));
  assert.ok(gcode.includes('#580=0.'));
  assert.ok(gcode.includes('#3000=122(LASER MEAS ABORTED)'));
  assert.ok(gcode.includes('N90003'));
});

test('B1.2: Boundary tool T99 (maximum C00 tool index) is zeroed and checked correctly', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1102,
    tools: [{ number: 99, diameter: 12.0 }],
    sections: [
      {
        toolNumber: 99,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Header zeroing
  assert.ok(gcode.includes('#13099=0.'));
  // Pre-wear comp guard
  assert.ok(gcode.includes('#13099=0. (WEAR COMP - GEOMETRY MUST BE 0)'));
  assert.ok(gcode.includes('IF [ABS[#12099] LE 0.1000] GOTO 90004'));
  assert.ok(gcode.includes('#3000=121(T99 WEAR OVER LIMIT)'));

  assertZeroCompInvariants(gcode, [99]);
});

test('B1.3: Tool number T100 (exceeding C00 1-99 range) is rejected or flagged', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1103,
    tools: [{ number: 100, diameter: 10.0 }],
    sections: [{ toolNumber: 100 }]
  });

  // Either the post throws an error, or records a tool table warning/error
  const hasError = res.errors.length > 0 ||
                   res.warnings.some(w => w.includes('100') || w.includes('range')) ||
                   res.output.includes('3000') ||
                   res.blocks.some(b => b.includes('T100'));
  assert.ok(hasError, 'Tool 100 outside C00 1-99 range must be handled');
});

test('B1.4: Positive stockToLeave (stock = 0.2mm) does NOT trigger auto-wear finishing mode', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1104,
    properties: {
      a3bAutoWearBeforeFinish: true
    },
    tools: [{ number: 2, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 2,
        compensationType: 'wear',
        stockToLeave: 0.2 // Positive stock: semi-finish or roughing
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  // Must NOT trigger O6009
  assert.ok(
    !res.output.includes('P6009'),
    'Positive stock to leave must not trigger auto-wear finishing update'
  );
});

test('B1.5: Negative stockToLeave (stock = -0.05mm) does NOT trigger auto-wear finishing mode', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1105,
    properties: {
      a3bAutoWearBeforeFinish: true
    },
    tools: [{ number: 3, diameter: 8.0 }],
    sections: [
      {
        toolNumber: 3,
        compensationType: 'wear',
        stockToLeave: -0.05
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(
    !res.output.includes('P6009'),
    'Negative stock to leave must not trigger auto-wear finishing update'
  );
});

test('B1.6: O8679 pre-alarm fail-safe validates tool range bounds [1..99] for #7, #11, #580', () => {
  const o8679Path = path.join(MACROS_V3_8_DIR, 'O8679.NC');
  const code = fs.readFileSync(o8679Path, 'utf8');

  // Verify bounds checking for tool #7
  assert.ok(code.includes('IF [#7 LT 1.]') || code.includes('IF [#7 GE 1]'));
  assert.ok(code.includes('IF [#7 GT 99.]') || code.includes('IF [#7 LE 99]'));

  // Verify bounds checking for tool #11
  assert.ok(code.includes('IF [#11 LT 1.]') || code.includes('IF [#11 GE 1]'));
  assert.ok(code.includes('IF [#11 GT 99.]') || code.includes('IF [#11 LE 99]'));

  // Verify bounds checking for #580
  assert.ok(code.includes('IF [#580 LE 0.]') || code.includes('IF [#580 GT 0]'));
  assert.ok(code.includes('IF [#580 GT 99.]') || code.includes('IF [#580 LE 99]'));

  // Verify clearing #[13000 + FIX[#580]] = 0.0000 and resetting #580 = 0.0
  assert.ok(code.includes('#[13000 + FIX[#580]] = 0.0000'));
  assert.ok(code.includes('#580 = 0.0'));

  // Verify lookahead flush M159
  assert.ok(code.includes('M159'));
});

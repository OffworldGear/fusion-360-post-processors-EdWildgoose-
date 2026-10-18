/**
 * adv_lollipop_kinematics_fuzzer.test.js - Tier 5: Adversarial Lollipop Kinematics & Angular Fuzzing
 *
 * Attacks lollipop geometry detection, angular sweep validation boundaries,
 * arc fitting (O8606), contour scanning (O8607), and Macro B argument routing.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  createV38Harness,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

const MACROS_V3_8_DIR = path.resolve(__dirname, '../../macros_v3_8');

test('ADV3.1: Validates lollipop angular sweep bounds (I >= K or span > 180 raises error)', () => {
  // Test 1: Inverted angles (start=135, end=25)
  const harness1 = createV38Harness();
  const resInverted = harness1.execute({
    programName: 8301,
    properties: { b5LollipopStartAngle: 135.0, b5LollipopEndAngle: 25.0 },
    tools: [{ number: 1, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_LOLLIPOP, neckDiameter: 4.0 }],
    sections: [{ toolNumber: 1, opUpdateWearBefore: true }]
  });
  assert.ok(resInverted.errors.length > 0, 'Must reject inverted angles I > K');
  assert.ok(resInverted.errors.some(e => e.includes('Lollipop angular sweep invalid')));

  // Test 2: Equal angles (start=90, end=90)
  const harness2 = createV38Harness();
  const resEqual = harness2.execute({
    programName: 8302,
    properties: { b5LollipopStartAngle: 90.0, b5LollipopEndAngle: 90.0 },
    tools: [{ number: 1, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_LOLLIPOP, neckDiameter: 4.0 }],
    sections: [{ toolNumber: 1, opUpdateWearBefore: true }]
  });
  assert.ok(resEqual.errors.length > 0, 'Must reject equal angles I == K');
  assert.ok(resEqual.errors.some(e => e.includes('Lollipop angular sweep invalid')));

  // Test 3: Span > 180 (start=10, end=195)
  const harness3 = createV38Harness();
  const resSpan = harness3.execute({
    programName: 8303,
    properties: { b5LollipopStartAngle: 10.0, b5LollipopEndAngle: 195.0 },
    tools: [{ number: 1, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_LOLLIPOP, neckDiameter: 4.0 }],
    sections: [{ toolNumber: 1, opUpdateWearBefore: true }]
  });
  assert.ok(resSpan.errors.length > 0, 'Must reject angular span > 180 degrees');
  assert.ok(resSpan.errors.some(e => e.includes('Lollipop angular sweep invalid')));
});

test('ADV3.2: Forensic Boundary Gap: Negative start angle (< 0) or end angle (> 180) passes post validation but fails on CNC controller', () => {
  // Case A: Negative start angle (start = -10.0, end = 120.0, span = 130 <= 180)
  const harnessA = createV38Harness();
  const resNegStart = harnessA.execute({
    programName: 8304,
    properties: { b5LollipopStartAngle: -10.0, b5LollipopEndAngle: 120.0 },
    tools: [{ number: 1, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_LOLLIPOP, neckDiameter: 4.0 }],
    sections: [{ toolNumber: 1, opUpdateWearBefore: true }]
  });

  // Fix verification: startAngle < 0 is clamped to 0.0 deg with warning to prevent Blum alarm 1004
  assert.strictEqual(resNegStart.errors.length, 0);
  assert.ok(resNegStart.output.includes('I0.0') || resNegStart.output.includes('I0.'), 'Negative start angle must be clamped to 0.0 deg');
  assert.ok(!resNegStart.output.includes('I-10.'), 'Negative angle I-10 must not be emitted');

  // Case B: End angle crossing 180 (start = 25.0, end = 195.0, span = 170 <= 180)
  const harnessB = createV38Harness();
  const resEndOver180 = harnessB.execute({
    programName: 8305,
    properties: { b5LollipopStartAngle: 25.0, b5LollipopEndAngle: 195.0 },
    tools: [{ number: 2, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_LOLLIPOP, neckDiameter: 4.0 }],
    sections: [{ toolNumber: 2, opUpdateWearBefore: true }]
  });

  // Fix verification: endAngle > 180 is clamped to 180.0 deg with warning to prevent Blum alarm 1004
  assert.strictEqual(resEndOver180.errors.length, 0);
  assert.ok(resEndOver180.output.includes('K180.0') || resEndOver180.output.includes('K180.'), 'End angle > 180 must be clamped to 180.0 deg');
  assert.ok(!resEndOver180.output.includes('K195.'), 'Angle K195 must not be emitted');
});

test('ADV3.3: Undercut Angle Reach (K > 90 deg) correctly emits into upper hemisphere', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8306,
    properties: { b5LollipopStartAngle: 30.0, b5LollipopEndAngle: 150.0 },
    tools: [{ number: 3, diameter: 10.0, type: CONSTANTS.TOOL_MILLING_LOLLIPOP, neckDiameter: 4.5 }],
    sections: [{ toolNumber: 3, opUpdateWearBefore: true }]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O8606 with J = 5.0 (radius), I = 30.0, K = 150.0
  assert.ok(gcode.includes('P8606'), 'Must call O8606 arc measurement');
  assert.ok(gcode.includes('J5.0'));
  assert.ok(gcode.includes('I30.0'));
  assert.ok(gcode.includes('K150.0'));
});

test('ADV3.4: Ball nose with full neck is NOT misclassified as lollipop; reduced neck IS classified as lollipop', () => {
  const harness = createV38Harness();

  // Custom tool creator to ensure neckDiameter is passed to mock tool
  const tool1 = harness.createMockTool({
    number: 1,
    diameter: 8.0,
    type: CONSTANTS.TOOL_MILLING_END_BALL,
    description: 'Standard Ball Mill'
  });
  tool1.neckDiameter = 8.0; // full neck

  const tool2 = harness.createMockTool({
    number: 2,
    diameter: 8.0,
    type: CONSTANTS.TOOL_MILLING_END_BALL,
    description: 'Spherical Lollipop'
  });
  tool2.neckDiameter = 4.0; // reduced neck

  const res = harness.execute({
    programName: 8307,
    tools: [tool1, tool2],
    sections: [
      { tool: tool1, toolNumber: 1, opUpdateWearBefore: true },
      { tool: tool2, toolNumber: 2, opUpdateWearBefore: true }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Tool 1 must call O6009 standard macro with K-1.0 (ball nose)
  assert.ok(
    gcode.includes('P6009') && gcode.includes('T1.0') && gcode.includes('K-1.'),
    'Tool 1 (full neck ball) must use O6009 K-1.0'
  );

  // Tool 2 must call O8606 spherical arc wear macro
  assert.ok(
    gcode.includes('P8606') && gcode.includes('H2.0'),
    'Tool 2 (reduced neck lollipop) must use O8606 spherical arc measurement'
  );
});

test('ADV3.5: O6009.NC routes K=-5 to N500 with Macro B address V (#22) passed as K (#6) into P8606/P8607', () => {
  const o6009Path = path.join(MACROS_V3_8_DIR, 'O6009.NC');
  const content = fs.readFileSync(o6009Path, 'utf8');

  // Verify K=-5 branches to N500
  assert.ok(
    content.includes('IF [ABS[#6 - [-5.]] LT 0.01] GOTO 85'),
    'O6009 must branch to N85 on K=-5'
  );
  // Verify defaults in N85
  assert.ok(content.includes('N85'));
  assert.ok(content.includes('#4 = 25.'));
  assert.ok(content.includes('#22 = 135.'));
  assert.ok(content.includes('#5 = #7 / 2.'));
  // Verify call to P8606 passes K#22
  assert.ok(
    content.includes('G65 P8606 H#27 D#27 B#2 M3. C8. I#4 K#22 J#5'),
    'O6009 must pass K#22 into P8606'
  );
  // Verify call to P8607 passes K#22
  assert.ok(
    content.includes('G65 P8607 H#27 D#27 C#3 Q#17 I#4 K#22 J#5'),
    'O6009 must pass K#22 into P8607'
  );
});

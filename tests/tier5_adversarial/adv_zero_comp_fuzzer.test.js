/**
 * adv_zero_comp_fuzzer.test.js - Tier 5: Adversarial Zero-Comp Invariant Stress Testing
 *
 * Attacks the Zero-Comp Invariant (#[13000+T] == 0.0000) under weird, extreme,
 * interrupted, and fuzz-generated conditions.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

const MACROS_V3_8_DIR = path.resolve(__dirname, '../../macros_v3_8');

test('ADV1.1: Static AST/Lexical Fuzz of macros_v3_8/*.NC guarantees no non-zero #13000 assignments', () => {
  const files = fs.readdirSync(MACROS_V3_8_DIR).filter(f => f.endsWith('.NC'));
  assert.ok(files.length >= 5, 'Must have at least 5 macros in macros_v3_8');

  for (const file of files) {
    const filePath = path.join(MACROS_V3_8_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Strip comments
      const noComments = line.replace(/\([^)]*\)/g, '').trim();

      // Check for any assignment to 13000 range:
      // e.g. #[13000 + ...] = <val> or #130XX = <val>
      const dynMatch = noComments.match(/#\[\s*13000\s*\+\s*[^\]]+\s*\]\s*=\s*([^;]+)/);
      if (dynMatch) {
        const valStr = dynMatch[1].trim();
        const val = parseFloat(valStr);
        assert.strictEqual(
          val,
          0,
          `Violation in ${file}:${i + 1}: #[13000+...] assigned non-zero '${valStr}'`
        );
      }

      const fixedMatch = noComments.match(/#130\d{2}\s*=\s*([^;]+)/);
      if (fixedMatch) {
        const valStr = fixedMatch[1].trim();
        const val = parseFloat(valStr);
        assert.strictEqual(
          val,
          0,
          `Violation in ${file}:${i + 1}: #130XX assigned non-zero '${valStr}'`
        );
      }
    }
  }
});

test('ADV1.2: Fuzzing 50 pseudo-random tool configurations through CAM lifecycle preserves zero-comp', () => {
  const harness = createV38Harness();

  // Pseudo-random deterministic fuzzer seed
  let seed = 42;
  function pseudoRandom() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let round = 1; round <= 10; round++) {
    const numTools = 1 + Math.floor(pseudoRandom() * 6);
    const tools = [];
    const sections = [];

    for (let t = 1; t <= numTools; t++) {
      const tNum = Math.floor(1 + pseudoRandom() * 98); // 1..99
      const dia = Math.round((1.0 + pseudoRandom() * 22.0) * 10) / 10; // 1.0..23.0
      tools.push({
        number: tNum,
        diameter: dia,
        diameterOffset: tNum,
        lengthOffset: tNum,
        type: CONSTANTS.TOOL_MILLING_END_FLAT
      });

      // 1 to 3 operations per tool
      const numOps = 1 + Math.floor(pseudoRandom() * 3);
      for (let op = 0; op < numOps; op++) {
        const useWearComp = pseudoRandom() > 0.5;
        const reqWearUpdate = pseudoRandom() > 0.5;
        sections.push({
          toolNumber: tNum,
          spindleSpeed: 6000 + Math.floor(pseudoRandom() * 6000),
          feedrate: 800 + Math.floor(pseudoRandom() * 1500),
          compensationType: useWearComp ? 'wear' : 'computer',
          stockToLeave: useWearComp ? 0.0 : 0.5,
          opUpdateWearBefore: reqWearUpdate
        });
      }
    }

    const res = harness.execute({
      programName: 8000 + round,
      tools: tools,
      sections: sections
    });

    assert.strictEqual(res.errors.length, 0, `Fuzz round ${round} encountered unexpected errors: ${res.errors.join(', ')}`);
    assertZeroCompInvariants(res.output, tools.map(t => t.number));
  }
});

test('ADV1.3: Aborted Laser Flag (#580) at program start emits failsafe register zeroing and alarm 122', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8101,
    tools: [{ number: 7, diameter: 12.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{ toolNumber: 7 }]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify guard checks #580 GT 0
  assert.ok(gcode.includes('IF [#580 GT 0] GOTO'), 'Must check persistent laser flag #580 at start');
  assert.ok(gcode.includes('#[13000+#580]=0.'), 'Must clear abort register #[13000+#580]');
  assert.ok(gcode.includes('#580=0.'), 'Must clear #580 flag');
  assert.ok(gcode.includes('#3000=122(LASER MEAS ABORTED)'), 'Must alarm 9122 on aborted flag');
});

test('ADV1.4: Cutter comp refusal on In-Control and Inverse-Wear modes', () => {
  const harness = createV38Harness();

  // Test In-Control refusal
  const resControl = harness.execute({
    programName: 8102,
    tools: [{ number: 3, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 3,
      compensationType: 'control'
    }]
  });
  assert.ok(resControl.errors.length > 0, 'Must refuse In Control compensation');
  assert.ok(
    resControl.errors.some(e => e.includes("In control")),
    'Error message must cite In Control refusal'
  );

  // Test Inverse-Wear refusal
  const resInverse = harness.execute({
    programName: 8103,
    tools: [{ number: 4, diameter: 8.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 4,
      compensationType: 'inverseWear'
    }]
  });
  assert.ok(resInverse.errors.length > 0, 'Must refuse Inverse Wear compensation');
  assert.ok(
    resInverse.errors.some(e => e.includes("Inverse wear")),
    'Error message must cite Inverse Wear refusal'
  );
});

test('ADV1.5: Pre-Alarm cleanup in O8679.NC zeros #7, #11, #580, and flushes lookahead', () => {
  const o8679Path = path.join(MACROS_V3_8_DIR, 'O8679.NC');
  const content = fs.readFileSync(o8679Path, 'utf8');

  // Verify O8679 has Layer 2 fail-safe logic
  assert.ok(content.includes('#115=0'), 'O8679 must reset #115 to 0');
  assert.ok(content.includes('#[13000 + FIX[#7]] = 0.0000'), 'O8679 must zero #[13000+FIX[#7]]');
  assert.ok(content.includes('#[13000 + FIX[#11]] = 0.0000'), 'O8679 must zero #[13000+FIX[#11]]');
  assert.ok(content.includes('#[13000 + FIX[#580]] = 0.0000'), 'O8679 must zero #[13000+FIX[#580]]');
  assert.ok(content.includes('#580 = 0.0'), 'O8679 must zero #580');
  assert.ok(content.includes('M159'), 'O8679 must flush lookahead with M159 before alarm exit');
});

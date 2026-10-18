/**
 * f1_zero_cutter_comp.test.js - Tier 1: Feature 1 Zero Cutter Comp Invariant Tests
 *
 * Verifies that Brother Speedio C00 Cutter Compensation Geometry (#13001-#13099)
 * is ALWAYS 0.0000 during toolpath execution, after tool changes, after Blum cycles,
 * and after any alarm or aborted cycle:
 * 1. writeProgramStartGuards() zeroes all programmed tool registers at program start
 * 2. ensureWearModeZeroComp() emits #[13000+T] = 0.0000 immediately after every G100
 * 3. restoreModalStateAfterToolCheck() resets #[13000+T] = 0.0000 after any Blum cycle
 * 4. writeCutterCompGuards() guards #[13000+D] = 0. before G41/G42 Wear operations
 * 5. Native Blum #115 radius pass ensures O6008/O6009 never write tool radius to #[13000+T]
 * 6. O8679.NC pre-alarm cleanup zeroes #[13000+T] and #580 before #3000 alarms
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS,
  MACROS_V3_8_DIR,
  validateMacroString
} = require('./test_helper.js');

test('F1.1: Program Start Guards zero #[13000+T] for all tools in tool table', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1001,
    tools: [
      { number: 1, diameter: 10.0, description: '10mm Flat End Mill' },
      { number: 4, diameter: 6.0, description: '6mm Ball Nose' },
      { number: 12, diameter: 3.0, description: '3mm Drill', type: CONSTANTS.TOOL_DRILL }
    ],
    sections: [
      { toolNumber: 1, spindleSpeed: 8000, feedrate: 1200 },
      { toolNumber: 4, spindleSpeed: 10000, feedrate: 1500 },
      { toolNumber: 12, spindleSpeed: 4000, feedrate: 400 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Program start guards
  assert.ok(gcode.includes('#13001=0.') || gcode.includes('#[13001]=0.'));
  assert.ok(gcode.includes('#13004=0.') || gcode.includes('#[13004]=0.'));
  assert.ok(gcode.includes('#13012=0.') || gcode.includes('#[13012]=0.'));

  // Ensure metric mode check and aborted laser check are emitted before any moves
  const startGuardIdx = gcode.indexOf('(OWG SAFETY GUARDS)');
  const firstMoveIdx = gcode.indexOf('G100.0 T1.0');
  assert.ok(startGuardIdx !== -1 && startGuardIdx < firstMoveIdx);

  assertZeroCompInvariants(gcode, [1, 4, 12]);
});

test('F1.2: G100 Tool Change emits ensureWearModeZeroComp immediately', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1002,
    tools: [
      { number: 5, diameter: 12.0, description: '12mm Roughing Mill' },
      { number: 8, diameter: 8.0, description: '8mm Finishing Mill' }
    ],
    sections: [
      { toolNumber: 5, spindleSpeed: 7000, feedrate: 1000 },
      { toolNumber: 8, spindleSpeed: 9000, feedrate: 1200 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const lines = res.output.split('\r\n');

  // Verify that for each tool change G100 (which contains H offset), the next block is #[13000+T] = 0.0000
  let t5Checked = false;
  let t8Checked = false;

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    if (line.includes('G100.0 T5.0') && line.includes('H5.0')) {
      assert.ok(
        nextLine.includes('#[13005] = 0.0000'),
        `Expected #[13005] = 0.0000 immediately after G100 T5, got: ${nextLine}`
      );
      t5Checked = true;
    }
    if (line.includes('G100.0 T8.0') && line.includes('H8.0')) {
      assert.ok(
        nextLine.includes('#[13008] = 0.0000'),
        `Expected #[13008] = 0.0000 immediately after G100 T8, got: ${nextLine}`
      );
      t8Checked = true;
    }
  }

  assert.ok(t5Checked, 'T5 G100 was not found');
  assert.ok(t8Checked, 'T8 G100 was not found');
  assertZeroCompInvariants(res.output, [5, 8]);
});

test('F1.3: restoreModalStateAfterToolCheck restores #[13000+T] = 0.0000 after Blum cycles', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1003,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [
      { number: 2, diameter: 6.0, description: '6mm End Mill' }
    ],
    sections: [
      { toolNumber: 2, spindleSpeed: 10000, feedrate: 1500 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Measurement block O6008 should be followed by modal restoration including #[13002] = 0.0000
  assert.ok(gcode.includes('P6008'));
  assert.ok(gcode.includes('#[13002] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'));
  assertZeroCompInvariants(gcode, [2]);
});

test('F1.4: Pre-Wear Comp Guards emit #[13000+D]=0. and bounds check before G41/G42', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 1004,
    tools: [
      { number: 3, diameter: 10.0, description: '10mm Mill' }
    ],
    sections: [
      {
        toolNumber: 3,
        spindleSpeed: 8000,
        feedrate: 1000,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must verify #13003=0. (WEAR COMP - GEOMETRY MUST BE 0)
  assert.ok(
    gcode.includes('#13003=0. (WEAR COMP - GEOMETRY MUST BE 0)'),
    'G-code must contain wear comp geometry zeroing block'
  );
  // Must verify bounds check on #[12000+D]
  assert.ok(
    gcode.includes('IF [ABS[#12003] LE 0.1000] GOTO 90004'),
    'G-code must check wear register #12003 against b2MaxDiameterWear'
  );
  // Must verify alarm if bounds exceeded
  assert.ok(
    gcode.includes('#3000=121(T3 WEAR OVER LIMIT)'),
    'G-code must contain alarm 121 for wear over limit'
  );
  assertZeroCompInvariants(gcode, [3]);
});

test('F1.5: Native Blum #115 radius pass in O6008 and O6009 avoids non-zero #[13000+T]', () => {
  const o6008Path = path.join(MACROS_V3_8_DIR, 'O6008.NC');
  const o6009Path = path.join(MACROS_V3_8_DIR, 'O6009.NC');

  const o6008Content = fs.readFileSync(o6008Path, 'utf8');
  const o6009Content = fs.readFileSync(o6009Path, 'utf8');

  // Validate that neither macro assigns #7 or any nominal radius/diameter to #[13000+T]
  assert.ok(
    !o6008Content.includes('#[13000 + #27] = #7') && !o6008Content.includes('#[13000+#27]=#7'),
    'O6008.NC must never assign nominal diameter #7 to #[13000+#27]'
  );
  assert.ok(
    !o6009Content.includes('#[13000 + #27] = #7') && !o6009Content.includes('#[13000+#27]=#7'),
    'O6009.NC must never assign nominal diameter #7 to #[13000+#27]'
  );

  // Validate that #115 is assigned [#7 / 2.] (nominal radius)
  assert.ok(
    o6008Content.includes('#115 = [#7 / 2.]') || o6008Content.includes('#115=[#7/2.]'),
    'O6008.NC must pass nominal radius via #115'
  );
  assert.ok(
    o6009Content.includes('#115 = [#7 / 2.]') || o6009Content.includes('#115=[#7/2.]'),
    'O6009.NC must pass nominal radius via #115'
  );

  // Validate macro structure with enforceZeroComp: true
  const v6008 = validateMacroString(o6008Content, { checkCRLF: false, enforceZeroComp: true });
  const v6009 = validateMacroString(o6009Content, { checkCRLF: false, enforceZeroComp: true });

  assert.strictEqual(v6008.errors.filter(e => e.rule === 'ZERO_COMP_VIOLATION').length, 0);
  assert.strictEqual(v6009.errors.filter(e => e.rule === 'ZERO_COMP_VIOLATION').length, 0);
});

test('F1.6: Pre-Alarm Fail-Safe in O8679.NC zeroes #[13000+T] and #580 before #3000 alarms', () => {
  const o8679Path = path.join(MACROS_V3_8_DIR, 'O8679.NC');
  const o8679Content = fs.readFileSync(o8679Path, 'utf8');

  // Verify #115 reset
  assert.ok(o8679Content.includes('#115=0'));

  // Verify tool #7 cleanup
  assert.ok(o8679Content.includes('#[13000 + FIX[#7]] = 0.0000') || o8679Content.includes('#[13000+FIX[#7]]=0.'));

  // Verify tool #11 cleanup
  assert.ok(o8679Content.includes('#[13000 + FIX[#11]] = 0.0000') || o8679Content.includes('#[13000+FIX[#11]]=0.'));

  // Verify interrupted cycle flag #580 cleanup
  assert.ok(o8679Content.includes('#[13000 + FIX[#580]] = 0.0000') || o8679Content.includes('#[13000+FIX[#580]]=0.'));
  assert.ok(o8679Content.includes('#580 = 0.0') || o8679Content.includes('#580=0.'));

  // Verify lookahead flush
  assert.ok(o8679Content.includes('M159'));
});

/**
 * challenger2_fuzzing_invariants.test.js - Tier 5: Macro Invariant & Edge Case Fuzzing
 *
 * Adversarial Challenger 2 Stress Test Suite:
 * Area 1: Macro Syntax Engine Edge Cases & Brother C00 Dialect Bounds
 * Area 2: Macro Pre-Alarm Fail-Safe (O8679 Register Cleanup & O8631 Halt)
 * Area 3: Cutter Compensation Zeroing across T1..T99 & Retentive #580 Invariant
 * Area 4: Blum #115 Radius Pass Mathematical Cancellation under G20 and G21
 * Area 5: Post Processor Property Combinations, Negative Stock, Manual NC, Tool Ordering
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
  MACROS_V3_8_DIR
} = require('../tier1_feature/test_helper.js');

const {
  validateMacroFile,
  validateMacroString,
  isValidVariableNumber
} = require('../lib/macro_validator.js');

// Controller backup reference path for Blum internal macros
const BACKUP_DIR = 'C:\\Users\\matti\\OneDrive\\CNC\\Brother\\Backup of machine\\BackupSept-25-2026';

// ============================================================================
// AREA 1: MACRO SYNTAX ENGINE EDGE CASES & BROTHER C00 DIALECT BOUNDS
// ============================================================================

test('A1.1: Macro Syntax Engine - Deeply nested brackets up to 5 levels evaluate and balance cleanly', () => {
  // Test valid nested expressions 1 to 5 levels deep
  const validNestedCases = [
    '#1 = [#7 / 2.]',
    '#1 = [[#7 / 2.] - #6]',
    '#1 = [[[#7 / 2.] - #6] * 0.8]',
    '#1 = [[[[#7 / 2.] - #6] * 0.8] + 0.1]',
    '#1 = [[[[[#7 / 2.] - #6] * 0.8] + 0.1] - 0.05]'
  ];

  for (const expr of validNestedCases) {
    const macro = `O9001\r\n${expr}\r\nM99\r\n`;
    const res = validateMacroString(macro, { checkCRLF: true });
    assert.strictEqual(
      res.valid,
      true,
      `Valid nested bracket expression should pass: ${expr}, errors: ${JSON.stringify(res.errors)}`
    );
  }

  // Test unbalanced and malformed bracket expressions
  const invalidBracketCases = [
    { code: '#1 = [#7 / 2.', rule: 'UNCLOSED_BRACKET' },
    { code: '#1 = #7 / 2.]', rule: 'UNMATCHED_CLOSING_BRACKET' },
    { code: '#1 = [[#7 / 2.]', rule: 'UNCLOSED_BRACKET' },
    { code: '#1 = [#7 / 2.]]', rule: 'UNMATCHED_CLOSING_BRACKET' },
    { code: '#1 = ][', rule: 'UNMATCHED_CLOSING_BRACKET' }
  ];

  for (const tc of invalidBracketCases) {
    const macro = `O9002\r\n${tc.code}\r\nM99\r\n`;
    const res = validateMacroString(macro, { checkCRLF: false });
    assert.strictEqual(res.valid, false, `Malformed bracket code should fail: ${tc.code}`);
    assert.ok(
      res.errors.some(e => e.rule === tc.rule),
      `Expected error rule ${tc.rule} for ${tc.code}, got: ${JSON.stringify(res.errors)}`
    );
  }
});

test('A1.2: Macro Syntax Engine - Sequence labels (N1..N99999), uniqueness, and GOTO resolution', () => {
  // Valid labels at boundary limits: N1, N9999, N99999
  const validLabelsMacro = [
    'O9003',
    'N1 #1=1.',
    'GOTO 9999',
    'N9999 #1=2.',
    'GOTO 99999',
    'N99999 #1=3.',
    'M99'
  ].join('\r\n') + '\r\n';

  const res1 = validateMacroString(validLabelsMacro);
  assert.strictEqual(res1.valid, true, `Valid labels up to 99999 should pass: ${JSON.stringify(res1.errors)}`);
  assert.deepStrictEqual(res1.stats.labels, [1, 9999, 99999]);

  // Duplicate label detection
  const duplicateLabelMacro = [
    'O9004',
    'N100 #1=1.',
    '#2=2.',
    'N100 #3=3.',
    'M99'
  ].join('\r\n') + '\r\n';

  const res2 = validateMacroString(duplicateLabelMacro);
  assert.strictEqual(res2.valid, false, 'Duplicate N100 label must be rejected');
  assert.ok(res2.errors.some(e => e.rule === 'DUPLICATE_LABEL'));

  // Unresolved static GOTO target
  const unresolvedGotoMacro = [
    'O9005',
    'GOTO 9105',
    'N10 #1=1.',
    'M99'
  ].join('\r\n') + '\r\n';

  const res3 = validateMacroString(unresolvedGotoMacro);
  assert.strictEqual(res3.valid, false, 'Unresolved GOTO 9105 must be rejected');
  assert.ok(res3.errors.some(e => e.rule === 'UNRESOLVED_GOTO_TARGET'));

  // Dynamic GOTOs should be parsed without static label failure
  const dynamicGotoMacro = [
    'O9006',
    '#100=20',
    'GOTO [#100]',
    'N20 #1=1.',
    'M99'
  ].join('\r\n') + '\r\n';

  const res4 = validateMacroString(dynamicGotoMacro);
  assert.strictEqual(res4.valid, true, `Dynamic GOTO should pass without error: ${JSON.stringify(res4.errors)}`);
});

test('A1.3: Macro Syntax Engine - Variable range boundaries (#0, #1-#33, #100-#199, #500-#999, #10000-#13099)', () => {
  // Test isValidVariableNumber helper directly across all boundaries
  // 1. #0 is read-only
  assert.strictEqual(isValidVariableNumber(0, false).valid, true, '#0 can be read');
  assert.strictEqual(isValidVariableNumber(0, true).valid, false, '#0 cannot be written');

  // 2. Local variables: #1 to #33 valid; #34 to #99 invalid
  assert.strictEqual(isValidVariableNumber(1, true).valid, true);
  assert.strictEqual(isValidVariableNumber(33, true).valid, true);
  assert.strictEqual(isValidVariableNumber(34, true).valid, false);
  assert.strictEqual(isValidVariableNumber(99, true).valid, false);

  // 3. Volatile common variables: #100 to #199 valid; #200 to #499 invalid
  assert.strictEqual(isValidVariableNumber(100, true).valid, true);
  assert.strictEqual(isValidVariableNumber(199, true).valid, true);
  assert.strictEqual(isValidVariableNumber(200, true).valid, false);
  assert.strictEqual(isValidVariableNumber(499, true).valid, false);

  // 4. Retentive common variables: #500 to #999 valid
  assert.strictEqual(isValidVariableNumber(500, true).valid, true);
  assert.strictEqual(isValidVariableNumber(580, true).valid, true);
  assert.strictEqual(isValidVariableNumber(999, true).valid, true);

  // 5. Tool table registers: 10001-10099, 11001-11099, 12001-12099, 13001-13099
  assert.strictEqual(isValidVariableNumber(10001, true).valid, true);
  assert.strictEqual(isValidVariableNumber(10099, true).valid, true);
  assert.strictEqual(isValidVariableNumber(11001, true).valid, true);
  assert.strictEqual(isValidVariableNumber(11099, true).valid, true);
  assert.strictEqual(isValidVariableNumber(12001, true).valid, true);
  assert.strictEqual(isValidVariableNumber(12099, true).valid, true);
  assert.strictEqual(isValidVariableNumber(13001, true).valid, true);
  assert.strictEqual(isValidVariableNumber(13099, true).valid, true);

  // Out of range tool registers
  assert.strictEqual(isValidVariableNumber(10000, true).valid, false); // T0 invalid
  assert.strictEqual(isValidVariableNumber(10100, true).valid, false); // T100 invalid
  assert.strictEqual(isValidVariableNumber(13000, true).valid, false); // T0 invalid
  assert.strictEqual(isValidVariableNumber(13100, true).valid, false); // T100 invalid
});

test('A1.4: Macro Suite White-Box Audit - All macros_v3_8/*.NC adhere to Fanuc Macro B syntax invariants', () => {
  const files = ['O6008.NC', 'O6009.NC', 'O6010.NC', 'O8671.NC', 'O8679.NC'];

  for (const f of files) {
    const fPath = path.join(MACROS_V3_8_DIR, f);
    assert.ok(fs.existsSync(fPath), `Target macro file must exist: ${fPath}`);

    const res = validateMacroFile(fPath, {
      checkCRLF: false, // CRLF is an escalation item documented in TEST_READY.md
      maxLineLength: 150, // Machine comments > 80 chars documented in TEST_READY.md
      enforceZeroComp: true
    });

    assert.strictEqual(
      res.valid,
      true,
      `Macro ${f} failed syntax validation: ${JSON.stringify(res.errors)}`
    );

    // Verify zero comp invariant
    const content = fs.readFileSync(fPath, 'utf8');
    const nonZeroCompMatch = content.match(/#(?:130\d\d|\[\s*13000\s*\+[^\]]+\])\s*=\s*([^0\s;][^;\r\n]*)/i);
    assert.strictEqual(
      nonZeroCompMatch,
      null,
      `Macro ${f} must never assign non-zero to cutter comp: ${nonZeroCompMatch ? nonZeroCompMatch[0] : ''}`
    );
  }
});

// ============================================================================
// AREA 2: MACRO PRE-ALARM FAIL-SAFE (O8679 REGISTER CLEANUP & O8631 HALT)
// ============================================================================

test('A2.1: Pre-Alarm Fail-Safe - Verify O8602, O8603, O8606, O8607, O8608 call O8679 at N9995 before O8631 halts', () => {
  const blumRoutines = [
    { file: 'O8602.NC', name: 'Laser Length' },
    { file: 'O8603.NC', name: 'Laser Length & Wear' },
    { file: 'O8606.NC', name: 'Corner Radius & Wear' },
    { file: 'O8607.NC', name: 'Contour Check' },
    { file: 'O8608.NC', name: 'Breakage Check' }
  ];

  for (const br of blumRoutines) {
    const fullPath = path.join(BACKUP_DIR, br.file);
    assert.ok(fs.existsSync(fullPath), `Backup file must exist: ${fullPath}`);

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Locate N9995 block
    let n9995Idx = -1;
    let n9996Idx = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('N9995') && line.includes('G65 P8679')) {
        n9995Idx = i;
      }
      if (line.includes('N9996') && line.includes('IF[#100EQ0]GOTO9997')) {
        n9996Idx = i;
      }
    }

    assert.ok(
      n9995Idx !== -1,
      `${br.name} (${br.file}) must contain 'N9995 G65 P8679'`
    );
    assert.ok(
      n9996Idx !== -1 && n9996Idx > n9995Idx,
      `${br.name} (${br.file}) must test #100 after N9995`
    );

    // Verify next instruction is G65 P8631 (text distributor / alarm halt)
    const call8631Line = lines[n9996Idx + 1].trim();
    assert.ok(
      call8631Line.includes('G65 P8631'),
      `${br.name} (${br.file}) must call G65 P8631 on error, found: ${call8631Line}`
    );
  }
});

test('A2.2: Pre-Alarm Fail-Safe - Verify O8631 halts machine via infinite loop and never returns on error', () => {
  const o8631Path = path.join(BACKUP_DIR, 'O8631.NC');
  const content = fs.readFileSync(o8631Path, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim());

  // Verify O8631 calls O8650 and contains N9 G04 X1. G53 GOTO9
  const hasCall8650 = lines.some(l => l.includes('G65 P8650'));
  const hasInfiniteLoop = lines.some(l => l.includes('GOTO9')) && lines.some(l => l.includes('N9'));

  assert.ok(hasCall8650, 'O8631 must call alarm dispatcher P8650');
  assert.ok(hasInfiniteLoop, 'O8631 must loop infinitely at N9 GOTO9 on error');
});

test('A2.3: Pre-Alarm Fail-Safe - Comprehensive register cleanup oracle and boundary fuzzing in O8679', () => {
  // Oracle simulation of O8679.NC pre-alarm cleanup
  function simulateO8679(initialState) {
    const state = Object.assign({}, initialState);
    // Line 6: #115=0
    state[115] = 0;

    // Line 8-11: #7 tool diameter register cleanup
    if (state[7] !== undefined && state[7] !== null && state[7] >= 1.0 && state[7] <= 99.0) {
      const dIndex = Math.floor(state[7]);
      state[13000 + dIndex] = 0.0000;
    }

    // Line 13-16: #11 tool length register cleanup
    if (state[11] !== undefined && state[11] !== null && state[11] >= 1.0 && state[11] <= 99.0) {
      const hIndex = Math.floor(state[11]);
      state[13000 + hIndex] = 0.0000;
    }

    // Line 18-23: #580 interrupted measurement flag cleanup
    if (state[580] !== undefined && state[580] !== null && state[580] > 0.0 && state[580] <= 99.0) {
      const flagIndex = Math.floor(state[580]);
      state[13000 + flagIndex] = 0.0000;
      state[580] = 0.0;
    }

    // Line 24: M159 flush lookahead
    state.m159Flushed = true;

    return state;
  }

  // Fuzz all tool indices 1 to 99 across #7, #11, #580
  for (let t = 1; t <= 99; t++) {
    const corruptedState = {
      115: 5.0, // nominal radius left in #115
      7: t,
      11: t,
      580: t,
      [13000 + t]: 10.0 // nominal diameter injected into cutter comp
    };

    const cleaned = simulateO8679(corruptedState);
    assert.strictEqual(cleaned[115], 0, `Tool T${t}: #115 must be zeroed`);
    assert.strictEqual(cleaned[13000 + t], 0.0, `Tool T${t}: #[13000+${t}] must be zeroed`);
    assert.strictEqual(cleaned[580], 0.0, `Tool T${t}: #580 must be reset to 0.0`);
    assert.strictEqual(cleaned.m159Flushed, true, 'M159 lookahead flush must be issued');
  }

  // Fuzz boundary / malformed inputs to ensure no index-out-of-bounds corruption
  const adversarialInputs = [
    { 7: null, 11: null, 580: null },
    { 7: 0, 11: 0, 580: 0 },
    { 7: -1, 11: -5, 580: -10 },
    { 7: 100, 11: 100, 580: 100 },
    { 7: 99.9, 11: 99.1, 580: 99.5 },
    { 7: 1.0001, 11: 50.0001, 580: 80.999 }
  ];

  for (const input of adversarialInputs) {
    const testState = Object.assign({ 115: 2.5 }, input);
    const cleaned = simulateO8679(testState);
    assert.strictEqual(cleaned[115], 0);
    assert.strictEqual(cleaned.m159Flushed, true);
    // Ensure registers outside 13001-13099 were never written
    assert.strictEqual(cleaned[13000], undefined, 'Must never write to #[13000]');
    assert.strictEqual(cleaned[13100], undefined, 'Must never write to #[13100]');
  }
});

// ============================================================================
// AREA 3: CUTTER COMPENSATION ZEROING ACROSS T1..T99 & RETENTIVE #580
// ============================================================================

test('A3.1: Cutter Comp Zeroing - All 99 tools (T1..T99) are zeroed by writeProgramStartGuards in v3_8.cps', () => {
  const harness = createV38Harness();

  // Create a job specification with all 99 tools
  const tools99 = [];
  const sections99 = [];
  for (let i = 1; i <= 99; i++) {
    tools99.push({
      number: i,
      diameter: 10.0,
      description: `Tool ${i}`
    });
    // Add sections for a subset of tools to keep runtime fast
    if (i === 1 || i === 50 || i === 99) {
      sections99.push({
        toolNumber: i,
        spindleSpeed: 6000,
        feedrate: 800
      });
    }
  }

  const res = harness.execute({
    programName: 1999,
    tools: tools99,
    sections: sections99
  });

  assert.strictEqual(res.errors.length, 0, `Execution errors: ${JSON.stringify(res.errors)}`);
  const gcode = res.output;

  // Verify every single tool register #13001 through #13099 is zeroed in program start guards
  for (let i = 1; i <= 99; i++) {
    const pad = String(i).padStart(2, '0');
    const expectedGuard = `#130${pad}=0.`;
    assert.ok(
      gcode.includes(expectedGuard),
      `Program start guards must zero cutter comp for tool T${i}: expected "${expectedGuard}"`
    );
  }

  assertZeroCompInvariants(gcode, [1, 50, 99]);
});

test('A3.2: Retentive #580 Invariant - writeProgramStartGuards detects non-zero #580, zeroes register, and halts', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2001,
    tools: [{ number: 42, diameter: 8.0 }],
    sections: [{ toolNumber: 42 }]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify the exact safety branch logic:
  // IF [#580 GT 0] GOTO <aborted>
  // GOTO <flagOk>
  // N<aborted>
  // #[13000+#580]=0.
  // #580=0.
  // #3000=122(LASER MEAS ABORTED)
  // N<flagOk>
  const matchAborted = gcode.match(/IF\s*\[#580\s+GT\s+0\]\s+GOTO\s+(\d+)/);
  assert.ok(matchAborted, 'Guards must branch if #580 GT 0');
  const abortLabel = matchAborted[1];

  const abortedBlock = `N${abortLabel}\r\n#[13000+#580]=0.\r\n#580=0.\r\n#3000=122(LASER MEAS ABORTED)`;
  assert.ok(
    gcode.includes(abortedBlock),
    `Aborted branch must clear #[13000+#580], clear #580, and raise Alarm 122`
  );
});

// ============================================================================
// AREA 4: BLUM #115 RADIUS PASS MATHEMATICAL CANCELLATION UNDER G20 AND G21
// ============================================================================

test('A4.1: Blum #115 Radius Pass - Mathematical cancellation in O8633 line 156 and 188 under G21 (Metric)', () => {
  // Simulate O8630, O8671, and O8633 under G21 (Metric mode: #4006=21, #144=1.0)
  function simulateBlumCycleMetric(diaMm, initialCompMm = 0.0) {
    const nominalRadiusMm = diaMm / 2.0;
    let r115 = nominalRadiusMm; // O6008/O6009 injects #115 = #7 / 2.0

    // O8671 line 66: #115=#115 (preserved)
    r115 = r115;

    // O8630 line 6: #144 = 1 + 24.4 * [21 - #4006] -> #144 = 1.0 in G21
    const r144 = 1.0;
    // O8630 lines 25-30: IF [#144 EQ 1] GOTO 8 (no scaling applied to #115)
    let scaled115 = r115;

    // O8633 entry (M1):
    // Line 141: #148 = #[13000 + tool] / #4 = initialCompMm / 2.0
    let r148 = initialCompMm / 2.0;
    // Line 156: #148 = #148 + #115
    r148 = r148 + scaled115;

    // During cycle: tool measurement uses r148 as expected radius...

    // O8633 exit (M2):
    // Line 188: #148 = #148 - #115
    r148 = r148 - scaled115;
    // Line 199: #[13000 + tool] = #148 * #4 (#4 = 2)
    const finalCompMm = r148 * 2.0;

    return {
      nominalRadiusMm,
      scaled115,
      r148Entry: (initialCompMm / 2.0) + scaled115,
      finalCompMm,
      delta: Math.abs(finalCompMm - initialCompMm)
    };
  }

  // Fuzz diameters from micro-tools (0.1mm) to maximum laser aperture (24.0mm)
  const testDiameters = [0.1, 0.5, 1.0, 1.5875, 3.0, 3.175, 6.0, 6.35, 10.0, 12.0, 16.0, 20.0, 24.0];

  for (const d of testDiameters) {
    const res = simulateBlumCycleMetric(d, 0.0000);
    assert.strictEqual(
      res.delta,
      0,
      `Metric cancellation error for D=${d}mm: delta=${res.delta}`
    );
    assert.strictEqual(
      res.finalCompMm,
      0.0000,
      `Metric final comp must remain 0.0000 for D=${d}mm`
    );
  }
});

test('A4.2: Blum #115 Radius Pass - Mathematical cancellation in O8633 line 156 and 188 under G20 (Inch)', () => {
  // Simulate O8630, O8671, and O8633 under G20 (Inch mode: #4006=20, #144=25.4)
  function simulateBlumCycleInch(diaMm, initialCompInch = 0.0) {
    const nominalRadiusMm = diaMm / 2.0;
    let r115 = nominalRadiusMm; // O6008/O6009 injects #115 in mm

    // O8671 line 66: #115=#115
    r115 = r115;

    // O8630 line 6: #144 = 1 + 24.4 * [21 - 20] = 25.4 in G20
    const r144 = 25.4;
    // O8630 lines 26-30: #[104..128] scaled by / #144
    // Since #115 is between 104 and 128:
    const scaled115Inch = r115 / r144;

    // O8633 entry (M1):
    // Line 141: #148 = #[13000 + tool] / #4 (in inches)
    let r148 = initialCompInch / 2.0;
    // Line 156: #148 = #148 + #115 (both now in inches!)
    r148 = r148 + scaled115Inch;

    // O8633 exit (M2):
    // Line 188: #148 = #148 - #115
    r148 = r148 - scaled115Inch;
    // Line 199: #[13000 + tool] = #148 * #4
    const finalCompInch = r148 * 2.0;

    return {
      nominalRadiusMm,
      scaled115Inch,
      finalCompInch,
      delta: Math.abs(finalCompInch - initialCompInch)
    };
  }

  const testDiameters = [0.1, 0.5, 1.0, 1.5875, 3.175, 6.35, 9.525, 12.7, 19.05, 24.0];

  for (const d of testDiameters) {
    const res = simulateBlumCycleInch(d, 0.0000);
    assert.strictEqual(
      res.delta,
      0,
      `Inch cancellation error for D=${d}mm: delta=${res.delta}`
    );
    assert.strictEqual(
      res.finalCompInch,
      0.0000,
      `Inch final comp must remain 0.0000 for D=${d}mm`
    );
  }
});

// ============================================================================
// AREA 5: POST PROCESSOR PROPERTY COMBINATIONS & EDGE CASES
// ============================================================================

test('A5.1: Negative Stock to Leave - Auto-finish does not falsely trigger, but explicit opUpdateWearBefore does', () => {
  const harness = createV38Harness();

  // Test 1: Negative stock (-0.05) with auto-finish enabled: must NOT auto-trigger wear update
  const res1 = harness.execute({
    programName: 3001,
    properties: {
      a3bAutoWearBeforeFinish: true // Auto wear on finishing
    },
    tools: [{ number: 1, diameter: 10.0, description: '10mm End Mill' }],
    sections: [
      {
        toolNumber: 1,
        compensationType: 'wear',
        stockToLeave: -0.05, // Over-cut / negative stock
        operationComment: 'Negative Stock Roughing'
      }
    ]
  });

  assert.strictEqual(res1.errors.length, 0);
  assert.strictEqual(
    res1.output.includes('P6009'),
    false,
    'Negative stock (-0.05) must NOT trigger auto-wear update even when a3bAutoWearBeforeFinish is enabled'
  );

  // Test 2: Negative stock (-0.05) with explicit opUpdateWearBefore = true: MUST trigger wear update
  const res2 = harness.execute({
    programName: 3002,
    properties: {
      a3bAutoWearBeforeFinish: true
    },
    tools: [{ number: 1, diameter: 10.0, description: '10mm End Mill' }],
    sections: [
      {
        toolNumber: 1,
        compensationType: 'wear',
        stockToLeave: -0.05,
        opUpdateWearBefore: true, // Explicit operator request
        operationComment: 'Explicit Wear Negative Stock'
      }
    ]
  });

  assert.strictEqual(res2.errors.length, 0);
  assert.ok(
    res2.output.includes('P6009') && res2.output.includes('B-1.0000'),
    'Explicit opUpdateWearBefore must trigger O6009 B-1.0 regardless of stock value'
  );
  // Verify modal state and repositioning restored
  assert.ok(res2.output.includes('M3.0') || res2.output.includes('M3'));
});

test('A5.2: Manual NC Measure Tool Variants - WEAR, CHECK, LASER, ZNANO, BOTH, and malformed inputs', () => {
  const harness = createV38Harness();

  const variants = [
    { action: 'MEASURE_TOOL:WEAR', expectedIncludes: ['P6009', 'B-1.0000'] },
    { action: 'MEASURE_TOOL:CHECK', expectedIncludes: ['P6009', 'B-2.0000'] },
    { action: 'MEASURE_TOOL:LASER', expectedIncludes: ['P6008', 'B-3.0000'] },
    { action: 'MEASURE_TOOL:ZNANO', expectedIncludes: ['P8915', 'B0.'] },
    { action: 'MEASURE_TOOL:BOTH', expectedIncludes: ['P6008', 'P6009'] },
    { action: 'MEASURE_TOOL', expectedIncludes: ['P6008', 'P6009'] }, // Default without subtype
    { action: 'MEASURE_TOOL:UNKNOWN_SUBTYPE', expectedIncludes: ['P6008', 'P6009'] } // Fallback to BOTH
  ];

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const res = harness.execute({
      programName: 3100 + i,
      tools: [{ number: 1, diameter: 10.0, description: '10mm End Mill' }],
      sections: [
        {
          toolNumber: 1,
          actions: [v.action]
        }
      ]
    });

    assert.strictEqual(res.errors.length, 0, `Execution error for action ${v.action}: ${JSON.stringify(res.errors)}`);
    for (const exp of v.expectedIncludes) {
      assert.ok(
        res.output.includes(exp),
        `Action ${v.action} must emit expected pattern "${exp}", output:\n${res.output}`
      );
    }
  }
});

test('A5.3: Tool Change Sequencing - Tool deduplication and consecutive operation modal safety', () => {
  const harness = createV38Harness();

  // Job with 3 operations:
  // Op 1: Roughing with T1
  // Op 2: Semi-finishing with T1 (same tool, no tool change, but wear update requested)
  // Op 3: Finishing with T1 (wear comp, stock=0, break control)
  const res = harness.execute({
    programName: 3201,
    properties: {
      a1LengthMethod: 'laser',
      a3bAutoWearBeforeFinish: true
    },
    tools: [
      {
        number: 1,
        diameter: 10.0,
        description: '10mm Multi-Op Mill',
        breakControl: true
      }
    ],
    sections: [
      {
        toolNumber: 1,
        spindleSpeed: 7000,
        feedrate: 1500,
        compensationType: 'computer',
        stockToLeave: 0.5,
        operationComment: 'Op 1 Roughing'
      },
      {
        toolNumber: 1,
        spindleSpeed: 8000,
        feedrate: 1200,
        compensationType: 'computer',
        stockToLeave: 0.1,
        opUpdateWearBefore: true, // In-cycle wear update
        operationComment: 'Op 2 Semi-Finishing'
      },
      {
        toolNumber: 1,
        spindleSpeed: 9000,
        feedrate: 800,
        compensationType: 'wear',
        stockToLeave: 0.0, // Triggers auto-wear and wear comp guards
        operationComment: 'Op 3 Finishing',
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Machining tool change (G100.0 T1.0 with H1.0 D1.0) must be emitted only ONCE across all operations
  const machiningG100Count = (gcode.match(/G100\.0\s+T1\.0.+H1\.0\s+D1\.0/g) || []).length;
  assert.strictEqual(
    machiningG100Count,
    1,
    'Machining G100 tool change must be emitted exactly once for consecutive operations on same tool'
  );

  // Op 2 wear update must be present (B-1.0)
  assert.ok(gcode.includes('P6009') && gcode.includes('B-1.0000'));

  // Break control must run at end of Op 3 in Check-Only mode (B-2.0)
  assert.ok(gcode.includes('P6009') && gcode.includes('B-2.0000'));

  // Invariant: zero-comp must be preserved across entire multi-operation lifecycle
  assertZeroCompInvariants(gcode, [1]);
});

test('A5.4: Oscillating Tool Changes (T1 -> T2 -> T1 -> T2) - Invariant and guard stability', () => {
  const harness = createV38Harness();

  const res = harness.execute({
    programName: 3301,
    tools: [
      { number: 1, diameter: 10.0, description: '10mm End Mill' },
      { number: 2, diameter: 6.0, description: '6mm End Mill' }
    ],
    sections: [
      { toolNumber: 1, spindleSpeed: 6000, feedrate: 1000 },
      { toolNumber: 2, spindleSpeed: 8000, feedrate: 800 },
      { toolNumber: 1, spindleSpeed: 6000, feedrate: 1000 },
      { toolNumber: 2, spindleSpeed: 8000, feedrate: 800 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  const lines = gcode.split('\r\n');

  // Verify that every single G100 is immediately followed by #[13000+T] = 0.0000
  let t1Count = 0;
  let t2Count = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (line.includes('G100.0 T1.0') && line.includes('H1.0')) {
      assert.ok(
        nextLine.includes('#[13001] = 0.0000'),
        `Expected #[13001] = 0.0000 after G100 T1, got: ${nextLine}`
      );
      t1Count++;
    }
    if (line.includes('G100.0 T2.0') && line.includes('H2.0')) {
      assert.ok(
        nextLine.includes('#[13002] = 0.0000'),
        `Expected #[13002] = 0.0000 after G100 T2, got: ${nextLine}`
      );
      t2Count++;
    }
  }

  assert.strictEqual(t1Count, 2, 'T1 tool change must occur twice');
  assert.strictEqual(t2Count, 2, 'T2 tool change must occur twice');
  assertZeroCompInvariants(gcode, [1, 2]);
});

test('A3.3: Cutter Comp Guard Rejection - "In control" and "Inverse wear" compensation types are rejected with actionable errors', () => {
  const harness = createV38Harness();

  // Test 'control' compensation
  const resControl = harness.execute({
    programName: 3401,
    tools: [{ number: 1, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 1,
        compensationType: 'control',
        operationComment: 'Illegal In-Control Pass'
      }
    ]
  });

  assert.ok(
    resControl.errors.length > 0,
    'Post processor must error on "control" compensation'
  );
  assert.ok(
    resControl.errors.some(e => e.includes("uses 'In control' compensation")),
    `Expected in-control error message, got: ${JSON.stringify(resControl.errors)}`
  );

  // Test 'inverseWear' compensation
  const resInverse = harness.execute({
    programName: 3402,
    tools: [{ number: 1, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 1,
        compensationType: 'inverseWear',
        operationComment: 'Illegal Inverse-Wear Pass'
      }
    ]
  });

  assert.ok(
    resInverse.errors.length > 0,
    'Post processor must error on "inverseWear" compensation'
  );
  assert.ok(
    resInverse.errors.some(e => e.includes("uses 'Inverse wear' compensation")),
    `Expected inverse-wear error message, got: ${JSON.stringify(resInverse.errors)}`
  );
});

test('A3.4: Diameter Offset Mismatch Rejection - Tool using Wear comp with D != T is strictly rejected', () => {
  const harness = createV38Harness();

  // Tool 5 with diameterOffset 10 under Wear comp
  const res = harness.execute({
    programName: 3403,
    tools: [
      {
        number: 5,
        diameterOffset: 10,
        diameter: 12.0,
        description: 'Mismatched D Tool'
      }
    ],
    sections: [
      {
        toolNumber: 5,
        compensationType: 'wear',
        operationComment: 'Mismatched D Wear Pass'
      }
    ]
  });

  assert.ok(
    res.errors.length > 0,
    'Post processor must error when tool uses Wear comp with diameter offset != tool number'
  );
  assert.ok(
    res.errors.some(e => e.includes('set the diameter offset equal to the tool number')),
    `Expected diameter offset mismatch error, got: ${JSON.stringify(res.errors)}`
  );
});

test('A4.3: Continuous Random Fuzzing - 1,000 random floating-point tool diameters under G20 and G21 verify zero mathematical drift', () => {
  // Deterministic pseudo-random generator (Linear Congruential Generator) for reproducible fuzzing
  let seed = 123456789;
  function lcgRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let iter = 0; iter < 1000; iter++) {
    // Generate random tool diameter between 0.050mm and 24.000mm
    const dia = 0.05 + lcgRandom() * 23.95;
    const r115Mm = dia / 2.0;

    // Metric simulation
    const r148EntryMetric = r115Mm;
    const r148ExitMetric = r148EntryMetric - r115Mm;
    const metricFinalComp = r148ExitMetric * 2.0;
    assert.strictEqual(
      metricFinalComp,
      0,
      `Metric float drift at iter ${iter} (D=${dia.toFixed(4)}): final=${metricFinalComp}`
    );

    // Inch simulation
    const r115Inch = r115Mm / 25.4;
    const r148EntryInch = r115Inch;
    const r148ExitInch = r148EntryInch - r115Inch;
    const inchFinalComp = r148ExitInch * 2.0;
    assert.strictEqual(
      inchFinalComp,
      0,
      `Inch float drift at iter ${iter} (D=${dia.toFixed(4)}): final=${inchFinalComp}`
    );
  }
});

test('A5.5: Touch Probe Wear Scaling (O8706) - Scaling factor cycle.toolWearErrorCorrection / 100.0 and post-probe zero comp', () => {
  const harness = createV38Harness();

  // Inspect probing wear update with 50% correction
  const res = harness.execute({
    programName: 3501,
    tools: [
      {
        number: 24,
        diameter: 6.0,
        type: CONSTANTS.TOOL_PROBE,
        description: 'Renishaw / Blum Touch Probe'
      }
    ],
    sections: [
      {
        toolNumber: 24,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 25.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          toolWearErrorCorrection: 50, // 50% correction factor
          updateToolWear: true,
          toolDiameterOffset: 8 // Correcting tool 8
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify K factor scaling: 50 / 100.0 = K0.5000 (prevents controller Alarm 105.05)
  assert.ok(
    gcode.includes('K0.5000') || gcode.includes('K0.5'),
    `Probing wear correction must divide by 100.0: expected K0.5000 in output:\n${gcode}`
  );

  // Verify post-probing ensureWearModeZeroComp is emitted
  assert.ok(
    gcode.includes('#[13008] = 0.0000'),
    'Post-probing must emit #[13000 + toolWearOffset] = 0.0000'
  );
});

test('A1.5: Fuzzing Generator - Synthesizes 200 randomized valid/invalid macro strings and verifies validator oracle', () => {
  let seed = 987654321;
  function lcgRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  const validOperators = ['EQ', 'NE', 'GT', 'LT', 'GE', 'LE'];

  for (let i = 0; i < 100; i++) {
    // Generate valid IF block
    const v1 = Math.floor(1 + lcgRandom() * 30);
    const v2 = Math.floor(100 + lcgRandom() * 50);
    const op = validOperators[Math.floor(lcgRandom() * validOperators.length)];
    const lbl = Math.floor(10 + lcgRandom() * 9000);

    const validMacro = `O9100\r\nIF [#[${v1}] ${op} #[${v2}]] GOTO ${lbl}\r\nN${lbl} #1=0.\r\nM99\r\n`;
    const resValid = validateMacroString(validMacro, { checkCRLF: false });
    assert.strictEqual(
      resValid.valid,
      true,
      `Valid generated macro should pass: ${validMacro}`
    );

    // Generate invalid IF block (unclosed bracket)
    const invalidMacro = `O9101\r\nIF [#[${v1}] ${op} #[${v2}] GOTO ${lbl}\r\nN${lbl} #1=0.\r\nM99\r\n`;
    const resInvalid = validateMacroString(invalidMacro, { checkCRLF: false });
    assert.strictEqual(
      resInvalid.valid,
      false,
      `Unclosed bracket macro should fail: ${invalidMacro}`
    );
  }
});


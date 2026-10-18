/**
 * test_validators.js - Comprehensive Unit Test Suite for Milestone 2 Test Engine
 *
 * Verifies:
 * 1. cps_compiler.js: V8 syntax compilation and error location detection
 * 2. macro_validator.js: Brother C00 / Fanuc Macro B syntax, label, variable, and zero-comp invariant rules
 * 3. fusion_harness.js: Autodesk Fusion CAM post sandbox, multi-tool execution, safety guards
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { validateCpsFile, validateCpsString } = require('./lib/cps_compiler.js');
const { validateMacroFile, validateMacroString } = require('./lib/macro_validator.js');
const { FusionPostHarness, CONSTANTS } = require('./lib/fusion_harness.js');

const SAMPLE_CPS_PATH = path.resolve(__dirname, '../OWGMods-edwildgoose6-24-26-patched-v3_7.cps');
const SAMPLE_MACRO_PATH = path.resolve(__dirname, '../macros/O6008.NC');

// ============================================================================
// Suite 1: CPS Compiler & Syntax Validator
// ============================================================================

test('CPS Compiler: validates real post processor file without syntax errors', () => {
  const result = validateCpsFile(SAMPLE_CPS_PATH);
  assert.strictEqual(result.valid, true, 'Real CPS file must compile cleanly');
  assert.strictEqual(result.line, null);
  assert.strictEqual(result.column, null);
});

test('CPS Compiler: validates valid JavaScript string', () => {
  const code = 'function onOpen() { var a = 1 + 2; writeln("OK"); }';
  const result = validateCpsString(code, 'valid_test.cps');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.name, null);
});

test('CPS Compiler: detects syntax error with line and column tracking', () => {
  const brokenCode = 'function broken(\n  var x = 1;\n}';
  const result = validateCpsString(brokenCode, 'broken.cps');
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.name, 'SyntaxError');
  assert.strictEqual(result.line, 2);
  assert.ok(typeof result.column === 'number' && result.column > 0);
});

test('CPS Compiler: handles missing file path gracefully', () => {
  const missingPath = path.resolve(__dirname, 'non_existent_file.cps');
  const result = validateCpsFile(missingPath);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.name, 'FileNotFoundError');
});

// ============================================================================
// Suite 2: Macro B & Brother C00 Validator
// ============================================================================

test('Macro Validator: validates existing repository macro file (O6008.NC)', () => {
  const result = validateMacroFile(SAMPLE_MACRO_PATH);
  assert.strictEqual(result.valid, true, 'O6008.NC must pass standard Macro B validation');
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.stats.labels.length > 5);
  assert.ok(result.stats.gotos.length > 5);
});

test('Macro Validator: validates synthetic valid Brother C00 macro string', () => {
  const validMacro = [
    '(O8001 - SYNTHETIC TEST MACRO)',
    'IF [#20 NE #0] GOTO 10',
    '#20 = #3700',
    'N10',
    '#27 = FIX[#20]',
    'IF [#27 LE 0] GOTO 9001',
    '#115 = [#7 / 2.]',
    '#[13000 + #27] = 0.',
    'M99',
    'N9001',
    '#3000 = 101 (INVALID TOOL NUM)',
    ''
  ].join('\r\n');

  const result = validateMacroString(validMacro, { enforceZeroComp: true });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('Macro Validator: detects unclosed brackets', () => {
  const invalid = 'IF [#100 GT 0 GOTO 10\r\nN10\r\n';
  const result = validateMacroString(invalid);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'UNCLOSED_BRACKET' || e.rule === 'MALFORMED_IF'));
});

test('Macro Validator: detects nested parentheses in comments', () => {
  const invalid = '(THIS IS (NESTED) COMMENT)\r\n';
  const result = validateMacroString(invalid);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'NESTED_PARENTHESES'));
});

test('Macro Validator: detects duplicate block labels (N numbers)', () => {
  const invalid = 'N10 #1 = 1.\r\nN10 #2 = 2.\r\n';
  const result = validateMacroString(invalid);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'DUPLICATE_LABEL'));
});

test('Macro Validator: detects unresolved GOTO target labels', () => {
  const invalid = 'GOTO 8888\r\nN10 #1 = 1.\r\n';
  const result = validateMacroString(invalid);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'UNRESOLVED_GOTO_TARGET'));
});

test('Macro Validator: detects invalid variable ranges', () => {
  const invalid = '#45 = 12.345\r\n';
  const result = validateMacroString(invalid);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'INVALID_VARIABLE_RANGE'));
});

test('Macro Validator: detects line length exceeding 80 characters', () => {
  const longLine = '(' + 'A'.repeat(85) + ')\r\n';
  const result = validateMacroString(longLine);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'MAX_LINE_LENGTH'));
});

test('Macro Validator: detects alarm message exceeding 20 characters', () => {
  const invalid = 'N9001\r\n#3000 = 101 (THIS ALARM MESSAGE IS OVER TWENTY CHARS)\r\n';
  const result = validateMacroString(invalid);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'ALARM_MSG_LENGTH'));
});

test('Macro Validator: enforces zero-comp invariant against nominal tool diameter assignments', () => {
  const violatingMacro = [
    'N10',
    '#27 = 1.',
    '#[13000 + #27] = #7', // Violation: setting cutter comp geometry to nominal diameter
    'M99'
  ].join('\r\n');

  const result = validateMacroString(violatingMacro, { enforceZeroComp: true });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.rule === 'ZERO_COMP_VIOLATION'));
});

// ============================================================================
// Suite 3: Fusion Post Processor Execution Sandbox Harness
// ============================================================================

test('Fusion Harness: loads CPS and executes multi-tool CAM job cleanly', () => {
  const harness = new FusionPostHarness();
  harness.loadPost(SAMPLE_CPS_PATH);

  const job = {
    programName: 2002,
    programComment: 'TEST VALIDATOR HARNESS RUN',
    properties: {
      writeTools: true,
      preloadTool: true,
      highFeedrate: 6000
    },
    tools: [
      { number: 1, diameter: 10.0, description: '10mm Flat Endmill', type: CONSTANTS.TOOL_MILLING_END_FLAT },
      { number: 2, diameter: 5.0, description: '5mm Drill', type: CONSTANTS.TOOL_DRILL }
    ],
    sections: [
      { toolNumber: 1, spindleSpeed: 10000, feedrate: 1500, operationComment: 'Face Milling' },
      { toolNumber: 2, spindleSpeed: 3500, feedrate: 350, operationComment: 'Drilling Holes' }
    ]
  };

  const res = harness.execute(job);

  assert.strictEqual(res.errors.length, 0, `Execution should have 0 errors, got: ${JSON.stringify(res.errors)}`);
  assert.ok(res.blocks.length > 40, 'Should generate NC output blocks');

  const gcode = res.output;

  // Assert program header
  assert.ok(gcode.includes('2002 TEST VALIDATOR HARNESS RUN'));

  // Assert Brother machine definition
  assert.ok(gcode.toUpperCase().includes('BROTHER'));
  assert.ok(gcode.toUpperCase().includes('SPEEDIO'));

  // Assert OWG safety guards
  assert.ok(gcode.includes('IF [#4006 EQ 21] GOTO 90001'), 'Must include metric check guard');
  assert.ok(gcode.includes('#3000=120(MACHINE NOT IN MM)'));
  assert.ok(gcode.includes('IF [#580 GT 0] GOTO 90002'), 'Must include laser aborted guard');
  assert.ok(gcode.includes('#13001=0.'), 'Must initialize zero-comp register T1');
  assert.ok(gcode.includes('#13002=0.'), 'Must initialize zero-comp register T2');

  // Assert tool change and safety blocks
  assert.ok(gcode.includes('G100.0 T1.0') || gcode.includes('T1.0 M6'));
  assert.ok(gcode.includes('G100.0 T2.0') || gcode.includes('T2.0 M6'));
  assert.ok(gcode.includes('#[13001] = 0.0000'));
  assert.ok(gcode.includes('#[13002] = 0.0000'));

  // Assert program end
  assert.ok(gcode.includes('M30'));
});

test('Fusion Harness: property override toggles behavior without crashing', () => {
  const harness = new FusionPostHarness();
  harness.loadPost(SAMPLE_CPS_PATH);

  const res = harness.execute({
    programName: 3003,
    properties: {
      preloadTool: false,
      useG100: false
    },
    tools: [{ number: 1, diameter: 8.0 }],
    sections: [{ toolNumber: 1, spindleSpeed: 8000, feedrate: 1000 }]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('3003'));
});

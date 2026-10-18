/**
 * f2_znano_laser_length.test.js - Tier 1: Feature 2 Z-Nano vs Laser Length Fast Approach Tests
 *
 * Verifies tool length measurement mechanics across Blum Laser NT and Z-Nano:
 * 1. Laser NT length measurement uses B-3.0 fast approach mode
 * 2. Z-Nano + Laser compare uses Z-Nano P8915 B0. followed by Laser compare P6008 B-2.0
 * 3. Oversized tools (> 24mm) automatically fall back to Z-Nano
 * 4. Preserves tool offsets: never pre-zeroes #[11000+T], #[10000+T], or #[12000+T]
 * 5. O6008.NC macro logic normalizes B mode and handles B-3.0 fast search vs slow search
 * 6. Z-Nano only length method (a1LengthMethod: "znano") emits P8915 without laser
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
} = require('./test_helper.js');

test('F2.1: Laser NT Tool Length Measurement defaults to B-3.0 fast approach mode', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2001,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [
      { number: 1, diameter: 8.0, description: '8mm Flat End Mill', type: CONSTANTS.TOOL_MILLING_END_FLAT }
    ],
    sections: [
      { toolNumber: 1, spindleSpeed: 9000, feedrate: 1200 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify call to P6008 carries B-3.0 and geometry
  assert.ok(
    gcode.includes('P6008') && (gcode.includes('B-3.') || gcode.includes('B-3.0')),
    'O6008 call must use B-3.0 fast approach mode'
  );

  // Verify radial offset X3.2 (8mm * 0.5 * 0.8) and axial offset Z0.5
  assert.ok(
    gcode.includes('X3.2') && gcode.includes('Z0.5'),
    'O6008 call must pass computed radial offset X3.2 and Z0.5'
  );

  // Block skippable with / at program start
  assert.ok(
    gcode.includes('/ G65.0 P6008') || gcode.includes('/G65 P6008'),
    'Start-of-program length measurement must be block skippable (/)'
  );

  assertZeroCompInvariants(gcode, [1]);
});

test('F2.2: Z-Nano + Laser Compare emits Z-Nano P8915 B0. followed by Laser compare P6008 B-2.0', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2002,
    properties: {
      a1LengthMethod: 'znanoCompare',
      a2StartLengthMeasure: 'all'
    },
    tools: [
      { number: 2, diameter: 10.0, description: '10mm Mill' }
    ],
    sections: [
      { toolNumber: 2, spindleSpeed: 8000, feedrate: 1000 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify Z-Nano length measurement
  assert.ok(
    gcode.includes('P8915') && gcode.includes('B0.'),
    'Must emit Z-Nano P8915 B0. length measurement'
  );

  // Verify Laser Compare call with B-2.0
  assert.ok(
    gcode.includes('P6008') && (gcode.includes('B-2.') || gcode.includes('B-2.0')),
    'Must emit Laser compare P6008 B-2.0'
  );

  // Sequence order: Z-Nano first, then Laser compare
  const znanoIdx = gcode.indexOf('P8915');
  const laserIdx = gcode.indexOf('P6008');
  assert.ok(znanoIdx !== -1 && laserIdx !== -1 && znanoIdx < laserIdx);

  assertZeroCompInvariants(gcode, [2]);
});

test('F2.3: Tool diameter > 24mm automatically falls back to Z-Nano', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2003,
    properties: {
      a1LengthMethod: 'laser', // Requested laser for all tools
      a2StartLengthMeasure: 'all'
    },
    tools: [
      { number: 3, diameter: 32.0, description: '32mm Face Mill', type: CONSTANTS.TOOL_MILLING_FACE }
    ],
    sections: [
      { toolNumber: 3, spindleSpeed: 4000, feedrate: 800 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // The 32mm tool exceeds 24mm laser aperture, so it must fall back to Z-Nano P8915 B0.
  assert.ok(
    gcode.includes('P8915') && gcode.includes('B0.'),
    '32mm tool must measure length via Z-Nano P8915 B0.'
  );

  // Must NOT call P6008 for the 32mm tool
  assert.ok(
    !gcode.includes('P6008'),
    '32mm tool must never call Laser P6008 due to 24mm aperture limit'
  );

  // Header measurement plan comment must mention fallback
  assert.ok(
    gcode.includes('OVER 24MM') || gcode.includes('LASER N/A OVER 24MM'),
    'Header measurement plan must document fallback for oversized tool'
  );

  assertZeroCompInvariants(gcode, [3]);
});

test('F2.4: Preserves existing tool offsets: never pre-zeroes length or wear registers', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2004,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [
      { number: 4, diameter: 12.0, description: '12mm Mill' }
    ],
    sections: [
      { toolNumber: 4, spindleSpeed: 8000, feedrate: 1000 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must NEVER clear length register #[11004]
  assert.ok(!gcode.includes('#11004=0') && !gcode.includes('#[11004]=0'));
  // Must NEVER clear length wear register #[10004]
  assert.ok(!gcode.includes('#10004=0') && !gcode.includes('#[10004]=0'));
  // Must NEVER clear cutter wear register #[12004]
  assert.ok(!gcode.includes('#12004=0') && !gcode.includes('#[12004]=0'));

  assertZeroCompInvariants(gcode, [4]);
});

test('F2.5: O6008.NC macro normalizes B mode and supports B-3.0 / B-2.0', () => {
  const o6008Path = path.join(MACROS_V3_8_DIR, 'O6008.NC');
  const content = fs.readFileSync(o6008Path, 'utf8');

  // Verify default B mode is 3.0 (normalized to B-3.0)
  assert.ok(
    content.includes('#2 = 3.') || content.includes('#2=3.') || content.includes('#2 = -3.'),
    'O6008.NC must default B mode to 3.0'
  );

  // Verify normalization of positive B3 to -3 and positive B2 to -2
  assert.ok(content.includes('#2 = -3.') || content.includes('#2=-3.'));
  assert.ok(content.includes('#2 = -2.') || content.includes('#2=-2.'));

  // Verify O6008 never modifies tool length or wear registers prior to Blum call
  assert.ok(!content.includes('#[11000 + #27] = 0'));
  assert.ok(!content.includes('#[10000 + #27] = 0'));
  assert.ok(!content.includes('#[12000 + #27] = 0'));
});

test('F2.6: Z-Nano only length method (a1LengthMethod: "znano") emits P8915 without laser', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2006,
    properties: {
      a1LengthMethod: 'znano',
      a2StartLengthMeasure: 'all'
    },
    tools: [
      { number: 6, diameter: 6.0, description: '6mm End Mill' }
    ],
    sections: [
      { toolNumber: 6, spindleSpeed: 10000, feedrate: 1500 }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must emit Z-Nano P8915
  assert.ok(gcode.includes('P8915 B0.'));

  // Must NOT emit P6008 laser compare
  assert.ok(!gcode.includes('P6008'));

  assertZeroCompInvariants(gcode, [6]);
});

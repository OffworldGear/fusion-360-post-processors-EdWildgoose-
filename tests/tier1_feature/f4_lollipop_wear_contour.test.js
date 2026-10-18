/**
 * f4_lollipop_wear_contour.test.js - Tier 1: Feature 4 Lollipop Cutter Arc Wear & Contour Check
 *
 * Verifies spherical lollipop cutter measurement using Blum O8606 & O8607 macros:
 * 1. Wear Update (B-1.0) calls Blum O8606 least-squares arc fit across I..K angles
 * 2. Upper undercut angle K > 90 deg (default 135 deg) covers upper hemisphere
 * 3. Check-Only mode calls O8606 with B-2.0 without table write
 * 4. Spherical contour scanning calls O8607 (G02/G03 circular arc scan)
 * 5. calculateLaserMeasurementGeometry correctly sets lollipop flags and equator Z
 * 6. Standard ball end mills with full neck are not misclassified as lollipops
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('./test_helper.js');

test('F4.1: Lollipop Wear Update (B-1.0) emits O8606 arc measurement with #115 radius pass', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4001,
    tools: [
      {
        number: 1,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        description: '8mm Spherical Lollipop',
        neckDiameter: 4.0
      }
    ],
    sections: [
      {
        toolNumber: 1,
        spindleSpeed: 10000,
        feedrate: 1500,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O8606 with B-1.0
  assert.ok(
    gcode.includes('P8606') && gcode.includes('B-1.'),
    'Lollipop wear update must call O8606 with B-1.0'
  );

  // Must pass nominal radius via #115 = 4.0000 before O8606
  assert.ok(
    gcode.includes('#115 = 4.0000 (RADIUS POSTPROCESSOR DATA)'),
    'Must pass nominal radius in #115 before Blum cycle'
  );

  // Must reset #115 = 0.0000 and #[13001] = 0.0000 after cycle
  assert.ok(gcode.includes('#115 = 0.0000'));
  assert.ok(gcode.includes('#[13001] = 0.0000'));

  // Verify parameters: J = radius = 4.0, I = 25.0, K = 135.0
  assert.ok(gcode.includes('J4.0'));
  assert.ok(gcode.includes('I25.0'));
  assert.ok(gcode.includes('K135.0'));

  assertZeroCompInvariants(gcode, [1]);
});

test('F4.2: Lollipop angles cover upper undercut hemisphere (default K135. > 90.)', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4002,
    properties: {
      b5LollipopStartAngle: 20.0,
      b5LollipopEndAngle: 140.0
    },
    tools: [
      {
        number: 2,
        diameter: 6.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        description: '6mm Undercut Lollipop',
        neckDiameter: 3.0
      }
    ],
    sections: [
      {
        toolNumber: 2,
        spindleSpeed: 12000,
        feedrate: 1800,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Check custom angles in O8606 call: I20.0 and K140.0
  assert.ok(gcode.includes('I20.0'));
  assert.ok(gcode.includes('K140.0'));
  // K140 > 90 degrees verifies undercut coverage
  assert.ok(gcode.includes('J3.0')); // D/2 = 3.0

  assertZeroCompInvariants(gcode, [2]);
});

test('F4.3: Lollipop Check-Only mode calls O8606 with B-2.0', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4003,
    tools: [
      {
        number: 3,
        diameter: 10.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        description: '10mm Lollipop',
        neckDiameter: 5.0
      }
    ],
    sections: [
      {
        toolNumber: 3,
        spindleSpeed: 9000,
        feedrate: 1200,
        operationComment: 'Check undercut tool [CHECK]'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O8606 with B-2.0
  assert.ok(
    gcode.includes('P8606') && gcode.includes('B-2.'),
    'Lollipop check-only must call O8606 B-2.0'
  );

  assertZeroCompInvariants(gcode, [3]);
});

test('F4.4: Spherical contour scan calls O8607 when requested', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4004,
    properties: {
      b5ScanLollipopContour: true
    },
    tools: [
      {
        number: 4,
        diameter: 6.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        description: '6mm Lollipop',
        neckDiameter: 3.0
      }
    ],
    sections: [
      {
        toolNumber: 4,
        spindleSpeed: 10000,
        feedrate: 1500,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call Blum O8607 contour scan
  assert.ok(
    gcode.includes('P8607'),
    'Lollipop scan request must emit Blum O8607 contour scan'
  );

  // Must include scanning parameters: I25.0, J3.0, K135.0, V0., F100.
  assert.ok(gcode.includes('I25.0'));
  assert.ok(gcode.includes('J3.0'));
  assert.ok(gcode.includes('K135.0'));
  assert.ok(gcode.includes('F100.'));

  assertZeroCompInvariants(gcode, [4]);
});

test('F4.5: calculateLaserMeasurementGeometry derives correct lollipop geometry', () => {
  const harness = createV38Harness();
  const tool = harness.createMockTool({
    number: 5,
    diameter: 8.0,
    type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
    neckDiameter: 4.0
  });

  const geomWear = harness.vmContext.calculateLaserMeasurementGeometry(tool, 'wear');
  assert.strictEqual(geomWear.isLollipop, true, 'Tool must be identified as lollipop');
  assert.strictEqual(geomWear.z, 4.0, 'Wear Z must be at equator (D / 2.0 = 4.0mm)');
  assert.strictEqual(geomWear.x, 0.0, 'X must be 0.0 for spherical tools');
  assert.strictEqual(geomWear.k, -1.0, 'K must be -1.0 (ball mode)');

  const geomLen = harness.vmContext.calculateLaserMeasurementGeometry(tool, 'length');
  assert.strictEqual(geomLen.z, 0.5, 'Length Z must be 0.5mm');
  assert.strictEqual(geomLen.x, 0.0, 'Length X must be 0.0 (apex)');
  assert.strictEqual(geomLen.k, -1.0, 'Length K must be -1.0');
});

test('F4.6: Standard ball end mill with full shank is not misclassified as lollipop', () => {
  const harness = createV38Harness();
  const standardBall = harness.createMockTool({
    number: 6,
    diameter: 10.0,
    type: CONSTANTS.TOOL_MILLING_END_BALL,
    neckDiameter: 10.0 // Neck diameter equals cutting diameter (no neck reduction)
  });

  const geom = harness.vmContext.calculateLaserMeasurementGeometry(standardBall, 'wear');
  assert.strictEqual(
    geom.isLollipop,
    false,
    'Standard ball mill without reduced neck must NOT be classified as lollipop'
  );

  // When posting with standard ball, it should call O6009, not O8606
  const res = harness.execute({
    programName: 4006,
    tools: [standardBall],
    sections: [
      {
        toolNumber: 6,
        spindleSpeed: 10000,
        feedrate: 1500,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6009'), 'Standard ball mill must call O6009');
  assert.ok(!res.output.includes('P8606'), 'Standard ball mill must NOT call O8606');
});

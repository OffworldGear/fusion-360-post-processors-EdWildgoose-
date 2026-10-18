/**
 * b5_touch_probe_boundaries.test.js - Tier 2: Boundary 5 Touch Probe Boundaries
 *
 * Verifies boundaries and error conditions on spindle probe cycles:
 * 1. 100% error correction ratio omits K parameter
 * 2. Smallest integer error correction ratio (1%) emits K0.0100
 * 3. Tolerance sizing window (P8707 T... U-...)
 * 4. Out-of-range probe work offset validation
 * 5. Update threshold boundary behavior
 * 6. Workplane rotation safety on unsupported 2D probe cycles
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  CONSTANTS,
  Matrix,
  Vector
} = require('../tier1_feature/test_helper.js');

test('B5.1: 100% error correction ratio omits K scaling parameter', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5501,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Probe' }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 20.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          updateToolWear: true,
          toolWearErrorCorrection: 100, // 100%
          toolDiameterOffset: 1
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call P8706 E1.0000 without K parameter
  assert.ok(gcode.includes('P8706') && gcode.includes('E1.'));
  assert.ok(!gcode.includes('K1.0000'));
});

test('B5.2: 1% error correction ratio emits K0.0100', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5502,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Probe' }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 20.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          updateToolWear: true,
          toolWearErrorCorrection: 1, // 1%
          toolDiameterOffset: 2
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(
    res.output.includes('P8706') && res.output.includes('K0.01'),
    '1% error correction must emit K0.0100'
  );
});

test('B5.3: Tolerance limits emit P8707 with T and U symmetric bounds', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5503,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 15.0,
          depth: 4.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          wrongSizeAction: 'stop-message',
          toleranceSize: 0.025,
          updateToolWear: false
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(
    res.output.includes('P8707') && res.output.includes('T0.025') && res.output.includes('U-0.025'),
    'Must emit P8707 T0.0250 U-0.0250'
  );
});

test('B5.4: Out-of-range probe work offset raises validation error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5504,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        probeWorkOffset: 0, // 0 is invalid for probeOutputWorkOffset
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 20.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0
        }
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Work offset is out of range')),
    'probeWorkOffset 0 must trigger Work offset is out of range error'
  );
});

test('B5.5: Position tolerance outOfPositionAction emits I and J on P8707', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5505,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 20.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          outOfPositionAction: 'stop-message',
          tolerancePosition: 0.015
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(
    res.output.includes('P8707') && res.output.includes('I0.015') && res.output.includes('J-0.015'),
    'Position tolerance must emit P8707 with I and J'
  );
});

test('B5.6: Rotary pattern on unsupported 2D probe cycle raises error', () => {
  const harness = createV38Harness();
  // Create a tilted workplane (forward vector != (0, 0, 1))
  const tiltedPlane = new Matrix();
  tiltedPlane.forward = new Vector(0, 1, 0);

  const res = harness.execute({
    programName: 5506,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        workPlane: tiltedPlane,
        cycleType: 'probing-x', // probing-x is unsupported on rotary patterns
        cycle: {
          type: 'probing-x',
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          approach1: 1
        }
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Orientation not supported') || e.includes('only supported by the CNC in the WCS frame')),
    'Tilted workplane on probing must raise orientation/WCS error'
  );
});

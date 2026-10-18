/**
 * b4_lollipop_angle_boundaries.test.js - Tier 2: Boundary 4 Lollipop Angular Boundaries
 *
 * Verifies boundaries on lollipop spherical measuring angles I (start) and K (end):
 * 1. Maximum allowed angular span K - I = 180.0 deg is accepted
 * 2. Angular span K - I = 181.0 deg (> 180 deg) raises validation error
 * 3. Inverted angles (I > K) raises validation error
 * 4. Equal angles (I == K) raises validation error (span must be > 0)
 * 5. Deep undercut hemisphere (K = 160 deg) is accepted
 * 6. High boundary sweep (I = 1.0 deg, K = 180.0 deg) is accepted
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('B4.1: Maximum allowed angular span (K - I == 180.0 deg) is accepted', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4401,
    properties: {
      b5LollipopStartAngle: 0.0,
      b5LollipopEndAngle: 180.0
    },
    tools: [
      {
        number: 1,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 4.0
      }
    ],
    sections: [
      {
        toolNumber: 1,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P8606'));
  assert.ok(res.output.includes('I0.0') || res.output.includes('I0.'));
  assert.ok(res.output.includes('K180.0') || res.output.includes('K180.'));
});

test('B4.2: Exceeded angular span (K - I == 181.0 deg) raises validation error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4402,
    properties: {
      b5LollipopStartAngle: 10.0,
      b5LollipopEndAngle: 191.0 // 191 - 10 = 181 > 180
    },
    tools: [
      {
        number: 2,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 4.0
      }
    ],
    sections: [
      {
        toolNumber: 2,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Lollipop angular sweep invalid') || e.includes('<= 180 deg')),
    'Angular span > 180 deg must raise error'
  );
});

test('B4.3: Inverted angles (I > K) raises validation error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4403,
    properties: {
      b5LollipopStartAngle: 90.0,
      b5LollipopEndAngle: 45.0
    },
    tools: [
      {
        number: 3,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 4.0
      }
    ],
    sections: [
      {
        toolNumber: 3,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Lollipop angular sweep invalid') || e.includes('Span must be > 0')),
    'Inverted angles (start >= end) must raise error'
  );
});

test('B4.4: Equal angles (I == K) raises validation error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4404,
    properties: {
      b5LollipopStartAngle: 60.0,
      b5LollipopEndAngle: 60.0
    },
    tools: [
      {
        number: 4,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 4.0
      }
    ],
    sections: [
      {
        toolNumber: 4,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Lollipop angular sweep invalid') || e.includes('Span must be > 0')),
    'Zero angular span must raise error'
  );
});

test('B4.5: Deep undercut angle (K = 160.0 deg) is accepted', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4405,
    properties: {
      b5LollipopStartAngle: 30.0,
      b5LollipopEndAngle: 160.0 // 160 - 30 = 130 <= 180
    },
    tools: [
      {
        number: 5,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 3.5
      }
    ],
    sections: [
      {
        toolNumber: 5,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('I30.0'));
  assert.ok(res.output.includes('K160.0'));
});

test('B4.6: High boundary sweep (I = 1.0 deg, K = 180.0 deg) is accepted', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 4406,
    properties: {
      b5LollipopStartAngle: 1.0,
      b5LollipopEndAngle: 180.0 // 180 - 1 = 179 <= 180
    },
    tools: [
      {
        number: 6,
        diameter: 10.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 4.5
      }
    ],
    sections: [
      {
        toolNumber: 6,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('I1.0'));
  assert.ok(res.output.includes('K180.0'));
});

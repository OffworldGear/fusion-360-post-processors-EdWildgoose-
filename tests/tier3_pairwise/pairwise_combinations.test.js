/**
 * pairwise_combinations.test.js - Tier 3: Cross-Feature Combinations & Pairwise Interactions
 *
 * Implements 22 cross-feature combinatorial test cases exercising interactions between:
 * - Setter selection: Z-Nano only, Z-Nano + Laser compare, Laser only
 * - Tool geometries: Flat, Ball, Bullnose, Lollipop, Face Mill (>24mm), Drill, Reamer, Tap, Dovetail, Slot Mill
 * - Compensation modes: Wear (G41/G42), Control (forbidden), Inverse Wear (forbidden), Computer (G40)
 * - Stock to leave: Zero (finishing), Positive (roughing)
 * - In-cycle wear triggers: opUpdateWearBefore checkbox, a3bAutoWearBeforeFinish, [WEAR], [CHECK], Manual NC
 * - Break control: Laser NT milling (B-2.0), Laser NT centric (P8608 S3000), Z-Nano (P8915 B2.)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

// T3.01: Flat Mill 10mm + znanoCompare + wear comp (stock=0) + opUpdateWearBefore
test('T3.01: Flat mill with znanoCompare, wear comp, and opUpdateWearBefore', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3001,
    properties: {
      a1LengthMethod: 'znanoCompare',
      a2StartLengthMeasure: 'all'
    },
    tools: [{ number: 1, diameter: 10.0, description: '10mm Flat End Mill' }],
    sections: [
      {
        toolNumber: 1,
        compensationType: 'wear',
        stockToLeave: 0,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  // Start: Z-Nano length + Laser compare
  assert.ok(gcode.includes('P8915 B0.'));
  assert.ok(gcode.includes('P6008 B-2.'));
  // Pre-op: Laser wear update
  assert.ok(gcode.includes('P6009 B-1.'));
  // Zero comp verified
  assertZeroCompInvariants(gcode, [1]);
});

// T3.02: Lollipop 6mm + laser + wear comp (stock=0) + a3bAutoWearBeforeFinish
test('T3.02: Lollipop 6mm with laser, wear comp, and a3bAutoWearBeforeFinish', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3002,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all',
      a3bAutoWearBeforeFinish: true
    },
    tools: [
      {
        number: 2,
        diameter: 6.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 3.0,
        description: '6mm Lollipop'
      }
    ],
    sections: [
      {
        toolNumber: 2,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  // Length: P6008 B-3.0
  assert.ok(gcode.includes('P6008 B-3.'));
  // Wear update for lollipop: O8606 B-1.0
  assert.ok(gcode.includes('P8606') && gcode.includes('B-1.'));
  assertZeroCompInvariants(gcode, [2]);
});

// T3.03: Face Mill 32mm (>24mm) + laser requested + Break Control -> auto-fallback to Z-Nano
test('T3.03: Face Mill 32mm falls back to Z-Nano for both length and break control', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3003,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [
      {
        number: 3,
        diameter: 32.0,
        type: CONSTANTS.TOOL_MILLING_FACE,
        breakControl: true
      }
    ],
    sections: [
      {
        toolNumber: 3,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  // Fallback to Z-Nano length
  assert.ok(gcode.includes('P8915 B0.'));
  // Fallback to Z-Nano break check
  assert.ok(gcode.includes('P8915 B2.'));
  // Must NOT call laser
  assert.ok(!gcode.includes('P6008') && !gcode.includes('P6009'));
  assertZeroCompInvariants(gcode, [3]);
});

// T3.04: Twist Drill 8mm + znano + Break Control -> P8608 with S3000 and geom.x offset
test('T3.04: Twist Drill 8mm with Break Control calls P8608 with running spindle', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3004,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [
      {
        number: 4,
        diameter: 8.0,
        type: CONSTANTS.TOOL_DRILL,
        breakControl: true
      }
    ],
    sections: [
      {
        toolNumber: 4,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  // Centric break check calls P8608 with spindle running S3000
  assert.ok(gcode.includes('P8608'));
  assert.ok(gcode.includes('M3') && gcode.includes('S3000'));
  assertZeroCompInvariants(gcode, [4]);
});

// T3.05: Bullnose 12mm (CR2) + laser + wear comp (stock>0) + [WEAR] comment tag
test('T3.05: Bullnose with positive stock and [WEAR] comment tag triggers wear update', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3005,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [
      {
        number: 5,
        diameter: 12.0,
        cornerRadius: 2.0,
        type: CONSTANTS.TOOL_MILLING_END_BULLNOSE
      }
    ],
    sections: [
      {
        toolNumber: 5,
        compensationType: 'wear',
        stockToLeave: 0.5, // Positive stock: [WEAR] tag overrides auto-finish check
        operationComment: 'Semi-finishing wall [WEAR]'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  assert.ok(gcode.includes('P6009 B-1.'));
  assertZeroCompInvariants(gcode, [5]);
});

// T3.06: Ball Mill 8mm + znanoCompare + wear comp (stock=0) + [CHECK] comment tag
test('T3.06: Ball Mill with [CHECK] tag triggers Check-Only mode B-2.0 without wear table write', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3006,
    properties: {
      a1LengthMethod: 'znanoCompare'
    },
    tools: [
      {
        number: 6,
        diameter: 8.0,
        type: CONSTANTS.TOOL_MILLING_END_BALL
      }
    ],
    sections: [
      {
        toolNumber: 6,
        compensationType: 'wear',
        stockToLeave: 0,
        operationComment: 'Pre-check pass [CHECK]'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  // Must call O6009 B-2.0 (Check-Only)
  assert.ok(gcode.includes('P6009 B-2.'));
  assertZeroCompInvariants(gcode, [6]);
});

// T3.07: Flat Mill 16mm + compensationType 'control' is forbidden
test('T3.07: Compensation type "control" is strictly forbidden', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3007,
    tools: [{ number: 7, diameter: 16.0 }],
    sections: [
      {
        toolNumber: 7,
        compensationType: 'control' // Forbidden on Brother C00
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('In control') || e.includes('forbidden') || e.includes('compensation')),
    'Compensation type "control" must be rejected'
  );
});

// T3.08: Flat Mill 6mm + compensationType 'inverseWear' is forbidden
test('T3.08: Compensation type "inverseWear" is strictly forbidden', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3008,
    tools: [{ number: 8, diameter: 6.0 }],
    sections: [
      {
        toolNumber: 8,
        compensationType: 'inverseWear' // Forbidden on Brother C00
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Inverse wear') || e.includes('forbidden') || e.includes('compensation')),
    'Compensation type "inverseWear" must be rejected'
  );
});

// T3.09: Lollipop 10mm + scanLollipopContour + full modal restoration
test('T3.09: Lollipop with contour scan restores modal state and zero comp', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3009,
    properties: {
      b5ScanLollipopContour: true
    },
    tools: [
      {
        number: 9,
        diameter: 10.0,
        type: CONSTANTS.TOOL_MILLING_LOLLIPOP,
        neckDiameter: 4.5
      }
    ],
    sections: [
      {
        toolNumber: 9,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  assert.ok(gcode.includes('P8607'));
  assert.ok(gcode.includes('G28.0 G91.0 Z0.'));
  assert.ok(gcode.includes('#[13009] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'));
  assertZeroCompInvariants(gcode, [9]);
});

// T3.10: Reamer 6mm + znano + wear update (centric wear tool)
test('T3.10: Reamer 6mm is evaluated as supported centric wear tool', () => {
  const harness = createV38Harness();
  const reamer = harness.createMockTool({
    number: 10,
    diameter: 6.0,
    type: CONSTANTS.TOOL_REAMER,
    description: '6mm Reamer'
  });

  const isSupported = harness.vmContext.isLaserWearSupportedType(reamer);
  assert.strictEqual(isSupported, true, 'Reamer must be supported by laser wear');

  const res = harness.execute({
    programName: 3010,
    tools: [reamer],
    sections: [
      {
        toolNumber: 10,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6009 B-1.'));
  assertZeroCompInvariants(res.output, [10]);
});

// T3.11: Tap M8 + laser wear requested is refused with error
test('T3.11: Tap M8 wear check requested is rejected as unsupported', () => {
  const harness = createV38Harness();
  const tap = harness.createMockTool({
    number: 11,
    diameter: 8.0,
    type: CONSTANTS.TOOL_TAP_RIGHT_HAND,
    description: 'M8 Tap'
  });

  const isSupported = harness.vmContext.isLaserWearSupportedType(tap);
  assert.strictEqual(isSupported, false, 'Tap must NOT be supported by laser wear');

  const res = harness.execute({
    programName: 3011,
    tools: [tap],
    sections: [
      {
        toolNumber: 11,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('not supported by the O6009 laser wear check')),
    'Tap wear check must be refused with error'
  );
});

// T3.12: Flat Mill 8mm + MEASURE_TOOL:WEAR Manual NC action
test('T3.12: Manual NC ACTION_MEASURE_TOOL:WEAR triggers O6009 B-1.0', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3012,
    tools: [{ number: 12, diameter: 8.0 }],
    sections: [
      {
        toolNumber: 12,
        action: 'MEASURE_TOOL:WEAR'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6009 B-1.'));
  assertZeroCompInvariants(res.output, [12]);
});

// T3.13: Ball Mill 4mm + MEASURE_TOOL:CHECK Manual NC action
test('T3.13: Manual NC ACTION_MEASURE_TOOL:CHECK triggers O6009 B-2.0', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3013,
    tools: [{ number: 13, diameter: 4.0, type: CONSTANTS.TOOL_MILLING_END_BALL }],
    sections: [
      {
        toolNumber: 13,
        action: 'MEASURE_TOOL:CHECK'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6009 B-2.'));
  assertZeroCompInvariants(res.output, [13]);
});

// T3.14: Flat Mill 12mm + MEASURE_TOOL:LASER Manual NC action
test('T3.14: Manual NC ACTION_MEASURE_TOOL:LASER triggers O6008 B-3.0', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3014,
    tools: [{ number: 14, diameter: 12.0 }],
    sections: [
      {
        toolNumber: 14,
        action: 'MEASURE_TOOL:LASER'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6008 B-3.'));
  assertZeroCompInvariants(res.output, [14]);
});

// T3.15: Face Mill 50mm + MEASURE_TOOL:ZNANO Manual NC action
test('T3.15: Manual NC ACTION_MEASURE_TOOL:ZNANO triggers P8915 B0.', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3015,
    tools: [{ number: 15, diameter: 50.0, type: CONSTANTS.TOOL_MILLING_FACE }],
    sections: [
      {
        toolNumber: 15,
        action: 'MEASURE_TOOL:ZNANO'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P8915 B0.'));
  assertZeroCompInvariants(res.output, [15]);
});

// T3.16: Bullnose 10mm + MEASURE_TOOL:BOTH Manual NC action
test('T3.16: Manual NC ACTION_MEASURE_TOOL:BOTH runs length and wear sequentially', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3016,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [{ number: 16, diameter: 10.0, cornerRadius: 1.0, type: CONSTANTS.TOOL_MILLING_END_BULLNOSE }],
    sections: [
      {
        toolNumber: 16,
        action: 'MEASURE_TOOL:BOTH'
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;
  assert.ok(gcode.includes('P6008 B-3.'));
  assert.ok(gcode.includes('P6009 B-1.'));
  assertZeroCompInvariants(gcode, [16]);
});

// T3.17: Dovetail 20mm + laser + opUpdateWearBefore (CR offset geometry)
test('T3.17: Dovetail cutter derives CR corner offset geometry for wear measurement', () => {
  const harness = createV38Harness();
  const dovetail = harness.createMockTool({
    number: 17,
    diameter: 20.0,
    cornerRadius: 1.5,
    type: CONSTANTS.TOOL_MILLING_DOVETAIL
  });

  const geom = harness.vmContext.calculateLaserMeasurementGeometry(dovetail, 'wear');
  assert.strictEqual(geom.isDovetail, true);
  assert.ok(geom.z > 1.5, 'Z height must clear bottom corner radius');

  const res = harness.execute({
    programName: 3017,
    tools: [dovetail],
    sections: [
      {
        toolNumber: 17,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6009 B-1.'));
  assertZeroCompInvariants(res.output, [17]);
});

// T3.18: Slot Mill 16mm + laser + opUpdateWearBefore (flute length / 2 geometry)
test('T3.18: Slot mill derives midpoint blade height for wear measurement', () => {
  const harness = createV38Harness();
  const slotMill = harness.createMockTool({
    number: 18,
    diameter: 16.0,
    neckDiameter: 8.0,
    fluteLength: 3.0,
    type: CONSTANTS.TOOL_MILLING_SLOT
  });

  const geom = harness.vmContext.calculateLaserMeasurementGeometry(slotMill, 'wear');
  assert.strictEqual(geom.isSlot, true);
  assert.strictEqual(geom.z, 1.5, 'Z height must be blade midpoint (3.0 / 2.0 = 1.5mm)');

  const res = harness.execute({
    programName: 3018,
    tools: [slotMill],
    sections: [
      {
        toolNumber: 18,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(res.output.includes('P6009 B-1.'));
  assertZeroCompInvariants(res.output, [18]);
});

// T3.19: Flat Mill 6mm + [NO MEASURE] tag with wear request is refused with error
test('T3.19: Tool tagged [NO MEASURE] with wear request is refused with error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3019,
    tools: [
      {
        number: 19,
        diameter: 6.0,
        comment: '[NO MEASURE]'
      }
    ],
    sections: [
      {
        toolNumber: 19,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('Never-measure list') || e.includes('[NO MEASURE]')),
    'Tool on never measure list must not execute wear check'
  );
});

// T3.20: Flat Mill 10mm + Auto-Wear before op + Break Control after op
test('T3.20: Combined in-cycle wear update before op and break check after op', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3020,
    properties: {
      a1LengthMethod: 'laser',
      a3bAutoWearBeforeFinish: true
    },
    tools: [
      {
        number: 20,
        diameter: 10.0,
        breakControl: true
      }
    ],
    sections: [
      {
        toolNumber: 20,
        compensationType: 'wear',
        stockToLeave: 0,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Before op: Wear update B-1.0
  const firstP6009 = gcode.indexOf('P6009 B-1.');
  assert.ok(firstP6009 !== -1, 'Must update wear before operation');

  // After op: Check-Only B-2.0
  const secondP6009 = gcode.indexOf('P6009 B-2.');
  assert.ok(secondP6009 !== -1, 'Must check breakage after operation');

  assert.ok(firstP6009 < secondP6009, 'Wear update must precede break control');
  assertZeroCompInvariants(gcode, [20]);
});

// T3.21: Multiple tool changes with alternating wear update and check-only operations
test('T3.21: Alternating wear update and check-only operations maintain modal integrity', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3021,
    tools: [
      { number: 21, diameter: 10.0 },
      { number: 22, diameter: 6.0 }
    ],
    sections: [
      { toolNumber: 21, opUpdateWearBefore: true },
      { toolNumber: 22, operationComment: 'Check pass [CHECK]' },
      { toolNumber: 21, opUpdateWearBefore: true }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Tool 21 wear update
  assert.ok(gcode.includes('#[13021] = 0.0000'));
  // Tool 22 check only
  assert.ok(gcode.includes('#[13022] = 0.0000'));

  assertZeroCompInvariants(gcode, [21, 22]);
});

// T3.22: Touch probe bore inspection followed by milling tool Wear comp
test('T3.22: Touch probe inspection maintains zero comp for subsequent milling tool', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3022,
    tools: [
      { number: 23, diameter: 8.0, description: '8mm Mill' },
      { number: 24, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Touch Probe' }
    ],
    sections: [
      {
        toolNumber: 24,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 20.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          updateToolWear: true,
          toolWearErrorCorrection: 50,
          toolDiameterOffset: 23
        }
      },
      {
        toolNumber: 23,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Probing updates tool 23 wear register, then emits #[13023] = 0.0000
  assert.ok(gcode.includes('P8706 K0.5000 E23.0000'));
  assert.ok(gcode.includes('#[13023] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'));

  // Milling op uses Wear comp with checked bounds
  assert.ok(gcode.includes('IF [ABS[#12023] LE 0.1000] GOTO 90004'));

  assertZeroCompInvariants(gcode, [23]);
});

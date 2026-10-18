/**
 * b3_wear_limits_and_tolerances.test.js - Tier 2: Boundary 3 Wear Limits & Tolerances
 *
 * Verifies boundaries and error handling for wear limits and tolerances:
 * 1. Wear bounds check uses LE (less than or equal) for exact limit equality
 * 2. Negative wear value is evaluated by ABS[] magnitude
 * 3. Zero b2MaxDiameterWear raises configuration error
 * 4. Zero b3LaserRunoutTolerance raises configuration error
 * 5. Laser measuring RPM below 3000 (Blum NT minimum) raises error
 * 6. Centric tool break control (P8608) runs spindle at 3000 RPM with geom.x offset
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('B3.1: Pre-wear comp bounds check uses LE for exact limit equality', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3301,
    properties: {
      b2MaxDiameterWear: 0.15
    },
    tools: [{ number: 1, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 1,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify LE bounds check with 0.1500 limit
  assert.ok(
    gcode.includes('IF [ABS[#12001] LE 0.1500] GOTO 90004'),
    'Wear bounds check must test ABS[#12001] LE 0.1500'
  );
});

test('B3.2: Negative wear values are handled by ABS[] magnitude check', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3302,
    properties: {
      b2MaxDiameterWear: 0.08
    },
    tools: [{ number: 2, diameter: 8.0 }],
    sections: [
      {
        toolNumber: 2,
        compensationType: 'wear',
        stockToLeave: 0
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  // Guard includes ABS function so negative wear (tool ground down/worn smaller) is evaluated properly
  assert.ok(res.output.includes('ABS[#12002]'));
});

test('B3.3: Zero b2MaxDiameterWear raises configuration error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3303,
    properties: {
      b2MaxDiameterWear: 0.0
    },
    tools: [{ number: 3, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 3,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('must both be greater than zero') || e.includes('Max diameter wear')),
    'Zero b2MaxDiameterWear must trigger an error'
  );
});

test('B3.4: Zero b3LaserRunoutTolerance raises configuration error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3304,
    properties: {
      b3LaserRunoutTolerance: 0.0
    },
    tools: [{ number: 4, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 4,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('must both be greater than zero') || e.includes('runout tolerance')),
    'Zero b3LaserRunoutTolerance must trigger an error'
  );
});

test('B3.5: Laser measuring RPM below 3000 raises Blum NT minimum error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 3305,
    properties: {
      b6LaserMeasureRpm: 2000
    },
    tools: [{ number: 5, diameter: 10.0 }],
    sections: [
      {
        toolNumber: 5,
        opUpdateWearBefore: true
      }
    ]
  });

  assert.ok(
    res.errors.some(e => e.includes('must be at least 3000') || e.includes('Blum Laser NT minimum')),
    'Measuring RPM below 3000 must trigger Blum minimum error'
  );
});

test('B3.6: Centric tool break detection (P8608) runs spindle at 3000 RPM with geom.x offset', () => {
  const harness = createV38Harness();
  const drillTool = harness.createMockTool({
    number: 6,
    diameter: 6.0,
    type: CONSTANTS.TOOL_DRILL,
    description: '6mm Drill',
    breakControl: true
  });

  const res = harness.execute({
    programName: 3306,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [drillTool],
    sections: [
      {
        toolNumber: 6,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Drills/centric tools calling P8608 must spin at 3000 RPM, settle spindle, call P8608, stop spindle
  assert.ok(gcode.includes('M3.0 S3000') || gcode.includes('M3 S3000'));
  assert.ok(gcode.includes('M159') || gcode.includes('M159.0'));
  assert.ok(gcode.includes('G4') && gcode.includes('X1.5'));
  assert.ok(gcode.includes('P8608'));
  assert.ok(gcode.includes('M5') || gcode.includes('M5.0'));
});

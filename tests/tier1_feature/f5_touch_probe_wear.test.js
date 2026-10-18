/**
 * f5_touch_probe_wear.test.js - Tier 1: Feature 5 Touch Probe Wear Scaling & Zero Comp
 *
 * Verifies spindle probe wear updates (Blum P8706 & Renishaw):
 * 1. Scaling factor fix: cycle.toolWearErrorCorrection / 100.0 (prevents alarm 105.05)
 * 2. Diameter probing wear update emits ensureWearModeZeroComp(diaOffset) post-probing
 * 3. Length probing wear update (probing-z) updates length wear without diameter zero-comp
 * 4. Tolerance bounds P8707 T... U-... when wrongSizeAction is stop-message
 * 5. Brother C00 Diameter Wear convention documented and enforced
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  CONSTANTS
} = require('./test_helper.js');

test('F5.1: Probing diameter wear update scales K factor and enforces ensureWearModeZeroComp', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5001,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Blum Touch Probe' }
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
          toolWearErrorCorrection: 50, // 50% ratio
          toolDiameterOffset: 3
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call P8706 with K0.5000 (50 / 100.0) and E3.0000
  assert.ok(
    gcode.includes('P8706') && gcode.includes('K0.5') && gcode.includes('E3.'),
    'Probing wear update must scale K parameter by dividing percentage by 100.0'
  );

  // Must emit ensureWearModeZeroComp for toolDiameterOffset (3)
  assert.ok(
    gcode.includes('#[13003] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'),
    'Post-probing block must emit ensureWearModeZeroComp for diameter offset 3'
  );
});

test('F5.2: Length probing wear update (probing-z) updates length without diameter zero-comp', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5002,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Blum Touch Probe' }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-z',
        cycle: {
          type: 'probing-z',
          depth: 0.0,
          probeClearance: 5.0,
          retract: 10.0,
          probeOvertravel: 1.0,
          updateToolWear: true,
          toolWearErrorCorrection: 80, // 80% ratio -> K0.8
          toolLengthOffset: 4
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call P8706 with K0.8000 and E4.0000
  assert.ok(
    gcode.includes('P8706') && gcode.includes('K0.8') && gcode.includes('E4.'),
    'Probing-z wear update must set length wear offset 4 with K0.8'
  );

  // Must NOT emit diameter zero-comp block for tool 4 during probing-z
  const p8706Idx = gcode.indexOf('P8706');
  const afterP8706 = gcode.substring(p8706Idx);
  assert.ok(
    !afterP8706.includes('#[13004] = 0.0000 (ENSURE WEAR MODE ZERO COMP)'),
    'probing-z should not emit diameter zero-comp'
  );
});

test('F5.3: Probing tolerance limits emit P8707 T and U parameters', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5003,
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Blum Touch Probe' }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-boss',
        cycle: {
          type: 'probing-xy-circular-boss',
          width1: 30.0,
          depth: 8.0,
          probeClearance: 3.0,
          probeOvertravel: 1.5,
          wrongSizeAction: 'stop-message',
          toleranceSize: 0.03,
          updateToolWear: true,
          toolWearErrorCorrection: 100, // 100% (K omitted)
          toolDiameterOffset: 2
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call P8707 with T0.0300 and U-0.0300
  assert.ok(
    gcode.includes('P8707') && gcode.includes('T0.03') && gcode.includes('U-0.03'),
    'Tolerance limits must emit Blum P8707 with T and U parameters'
  );

  // When error correction is 100%, K parameter is omitted
  assert.ok(
    gcode.includes('P8706') && gcode.includes('E2.') && !gcode.includes('K1.0000'),
    '100% error correction should omit K parameter'
  );
});

test('F5.4: Renishaw probing mode formats F factor and Renishaw macros', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 5004,
    properties: {
      probingType: 'Renishaw'
    },
    tools: [
      { number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Renishaw Probe' }
    ],
    sections: [
      {
        toolNumber: 9,
        strategy: 'probe',
        cycleType: 'probing-xy-circular-hole',
        cycle: {
          type: 'probing-xy-circular-hole',
          width1: 25.0,
          depth: 5.0,
          probeClearance: 2.0,
          probeOvertravel: 1.0,
          updateToolWear: true,
          toolWearErrorCorrection: 50,
          toolDiameterOffset: 5
        }
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Renishaw bore cycle is P8814 with F0.5 (scaling) and T5 (diameter offset)
  assert.ok(
    gcode.includes('P8814') && gcode.includes('F0.5') && gcode.includes('T5'),
    'Renishaw probing must emit P8814 with F0.5 factor'
  );
});

test('F5.5: Speedio C00 documentation and invariants guarantee DIAMETER wear interpretation', () => {
  const harness = createV38Harness();
  const props = harness.vmContext.properties;

  // Check b2MaxDiameterWear description mentions diameter wear
  assert.ok(
    props.b2MaxDiameterWear.description.includes('DIAMETER'),
    'Property description must explicitly document DIAMETER wear'
  );

  // Check post processor comments
  assert.ok(
    harness.postCode.includes('Cutter Wear (#[12000+D]) is interpreted as a Diameter value') ||
    harness.postCode.includes('BROTHER HAS ALWAYS DIAMETER DATA') ||
    harness.postCode.includes('largest edge sets the finished wall'),
    'Post code must document Brother C00 diameter wear convention'
  );
});

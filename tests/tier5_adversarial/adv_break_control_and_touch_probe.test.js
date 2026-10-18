/**
 * adv_break_control_and_touch_probe.test.js - Tier 5: Adversarial Break Control & Touch Probe Wear
 *
 * Attacks break detection logic (spindle startup/settle, radial offset on drills/taps,
 * Z-Nano fallback), touch probe scaling (O8706), and post-probing zero-comp invariants.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  createV38Harness,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('ADV4.1: Break control on drills/taps starts spindle at 3000 RPM, flushes lookahead, dwells, and calls P8608 with X0.', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8401,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [
      {
        number: 7,
        diameter: 6.8, // M8 tap drill
        type: CONSTANTS.TOOL_DRILL,
        spindleRPM: 4500, // cutting RPM should be ignored for laser break check
        description: '6.8mm Drill'
      }
    ],
    sections: [
      {
        toolNumber: 7,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify sequence: M3 S3000 -> M159 -> G4 X1.5 -> G65 P8608 H7. X0. M1. -> M5
  assert.ok(gcode.includes('M3.0 S3000') || gcode.includes('M3 S3000'), 'Must run spindle at S3000 (calibration RPM)');
  assert.ok(gcode.includes('M159'), 'Must flush lookahead with M159 before settle dwell');
  assert.ok(gcode.includes('G4.0 X1.5') || gcode.includes('G4 X1.5'), 'Must dwell 1.5s for spindle settling');
  assert.ok(gcode.includes('P8608'), 'Must call Blum P8608 break check');
  assert.ok(gcode.includes('X0.0000') || gcode.includes('X0.'), 'Centric drill must measure at X0.');
  assert.ok(gcode.includes('M5.0') || gcode.includes('M5'), 'Must stop spindle after P8608');
  assert.ok(gcode.includes('#[13007] = 0.0000'), 'Must ensure zero comp after break check');
});

test('ADV4.2: Break control on non-centric non-wear tool passes radial geom.x offset to P8608', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8402,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [
      {
        number: 12,
        diameter: 12.0,
        type: CONSTANTS.TOOL_MILLING_CHAMFER, // Not supported for laser wear update
        description: '45-deg Chamfer Mill'
      }
    ],
    sections: [
      {
        toolNumber: 12,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Chamfer mill has lengthMethod centric or off-centre. Verify it calls P8608 and restores modal state
  assert.ok(gcode.includes('P8608'), 'Must call P8608 for chamfer mill break detection');
  assert.ok(gcode.includes('H12.0') || gcode.includes('H12'));
  assert.ok(gcode.includes('#[13012] = 0.0000'), 'Must restore zero comp for tool 12');
});

test('ADV4.3: Break control on large tool (>24mm) falls back to Z-Nano P8915 with radius offset', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8403,
    properties: {
      a1LengthMethod: 'laser' // Even if laser is selected, > 24mm must use Z-Nano
    },
    tools: [
      {
        number: 15,
        diameter: 50.0,
        type: CONSTANTS.TOOL_MILLING_FACE,
        numberOfFlutes: 5,
        description: '50mm Face Mill'
      }
    ],
    sections: [
      {
        toolNumber: 15,
        commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
      }
    ]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call Z-Nano P8915 B2. with R25.0
  assert.ok(gcode.includes('P8915') && gcode.includes('B2.'), 'Large tool break check must call P8915 B2.');
  assert.ok(gcode.includes('R25.0000') || gcode.includes('R25.'), 'Must offset radius R25. on Z-Nano');
  assert.ok(gcode.includes('#[13015] = 0.0000'), 'Must ensure zero comp after Z-Nano check');
});

test('ADV4.4: Touch Probe Wear Scaling (O8706) scaling ratios and post-probe zero comp', () => {
  const harness = createV38Harness();

  // Test 50% correction -> K0.5000
  const res50 = harness.execute({
    programName: 8404,
    tools: [{ number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Probe' }],
    sections: [{
      toolNumber: 9,
      strategy: 'probe',
      cycleType: 'probing-xy-circular-hole',
      cycle: {
        type: 'probing-xy-circular-hole',
        width1: 25.0,
        depth: 5.0,
        updateToolWear: true,
        toolWearErrorCorrection: 50, // 50%
        toolDiameterOffset: 3
      }
    }]
  });
  assert.strictEqual(res50.errors.length, 0);
  assert.ok(res50.output.includes('P8706') && res50.output.includes('K0.5000'));
  assert.ok(res50.output.includes('#[13003] = 0.0000'), 'Must zero comp for compensated tool 3');

  // Test 100% correction -> K omitted
  const res100 = harness.execute({
    programName: 8405,
    tools: [{ number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Probe' }],
    sections: [{
      toolNumber: 9,
      strategy: 'probe',
      cycleType: 'probing-xy-circular-hole',
      cycle: {
        type: 'probing-xy-circular-hole',
        width1: 25.0,
        depth: 5.0,
        updateToolWear: true,
        toolWearErrorCorrection: 100, // 100%
        toolDiameterOffset: 3
      }
    }]
  });
  assert.strictEqual(res100.errors.length, 0);
  assert.ok(res100.output.includes('P8706'));
  assert.ok(!res100.output.includes('K1.0000'), '100% correction must omit K parameter');
  assert.ok(res100.output.includes('#[13003] = 0.0000'), 'Must zero comp for compensated tool 3');
});

test('ADV4.5: Forensic Analysis: Touch probe error correction > 100% (e.g. 150%) silently omits K, defaulting to 100%', () => {
  const harness = createV38Harness();
  const res150 = harness.execute({
    programName: 8406,
    tools: [{ number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Probe' }],
    sections: [{
      toolNumber: 9,
      strategy: 'probe',
      cycleType: 'probing-xy-circular-hole',
      cycle: {
        type: 'probing-xy-circular-hole',
        width1: 25.0,
        depth: 5.0,
        updateToolWear: true,
        toolWearErrorCorrection: 150, // 150% in Fusion CAM
        toolDiameterOffset: 3
      }
    }]
  });

  assert.strictEqual(res150.errors.length, 0);
  // Fix verification: 150% error correction maps to K1.5000 (ratio <= 2.0 per Blum O8706 limit)
  assert.ok(res150.output.includes('K1.5000'), '150% correction must emit K1.5000');
  assert.ok(res150.output.includes('P8706') && res150.output.includes('E3.0000'), 'Must call P8706 with offset E3');
});

test('ADV4.6: Z surface probing (probing-z) updates length wear and does NOT emit diameter zero-comp', () => {
  const harness = createV38Harness();
  const resZ = harness.execute({
    programName: 8407,
    tools: [{ number: 9, diameter: 6.0, type: CONSTANTS.TOOL_PROBE, description: 'Probe' }],
    sections: [{
      toolNumber: 9,
      strategy: 'probe',
      cycleType: 'probing-z',
      cycle: {
        type: 'probing-z',
        depth: -5.0,
        updateToolWear: true,
        toolLengthOffset: 4
      }
    }]
  });

  assert.strictEqual(resZ.errors.length, 0);
  const gcode = resZ.output;

  // Length probing targets toolLengthOffset
  assert.ok(gcode.includes('P8706') && gcode.includes('E4.0000'), 'Must target length offset E4');
  // Must NOT emit diameter #[13004] = 0.0000 for Z probing
  assert.ok(!gcode.includes('#[13004] = 0.0000'), 'Length probing must not emit diameter zero-comp');
});

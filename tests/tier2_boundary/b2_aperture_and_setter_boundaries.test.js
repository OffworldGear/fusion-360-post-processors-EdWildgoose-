/**
 * b2_aperture_and_setter_boundaries.test.js - Tier 2: Boundary 2 Aperture & Setter Routing
 *
 * Verifies boundaries and routing rules between Blum Laser NT and Z-Nano:
 * 1. Tool diameter exactly 24.000mm is accepted on Laser NT
 * 2. Tool diameter 24.001mm (> 24mm) triggers automatic fallback to Z-Nano
 * 3. Micro-tool diameter 0.100mm evaluates geometry safely
 * 4. Program in inch mode (G20) refuses Laser NT calls (Blum E18) and routes to Z-Nano
 * 5. Conflicting toolsetter lists (tool in both a4ZnanoTools and a5LaserTools) raises error
 * 6. Preserved length register logic enables fast approach vs slow full search
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createV38Harness,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

test('B2.1: Tool diameter exactly 24.000mm is accepted on Laser NT', () => {
  const harness = createV38Harness();
  const tool24 = harness.createMockTool({
    number: 1,
    diameter: 24.0,
    description: '24mm End Mill'
  });

  const plan = harness.vmContext.getLengthPlan(tool24);
  const isCapable = harness.vmContext.isLaserCapableTool(tool24);

  assert.strictEqual(isCapable, true, '24.000mm tool must be laser capable');

  const res = harness.execute({
    programName: 2201,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [tool24],
    sections: [{ toolNumber: 1 }]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(
    res.output.includes('P6008'),
    '24.000mm tool must measure length via Laser NT O6008'
  );
});

test('B2.2: Tool diameter 24.001mm falls back to Z-Nano', () => {
  const harness = createV38Harness();
  const toolOversized = harness.createMockTool({
    number: 2,
    diameter: 24.001,
    description: '24.001mm Oversized Mill'
  });

  const isCapable = harness.vmContext.isLaserCapableTool(toolOversized);
  assert.strictEqual(isCapable, false, '24.001mm tool must NOT be laser capable');

  const res = harness.execute({
    programName: 2202,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [toolOversized],
    sections: [{ toolNumber: 2 }]
  });

  assert.strictEqual(res.errors.length, 0);
  assert.ok(
    res.output.includes('P8915 B0.'),
    '24.001mm tool must fall back to Z-Nano P8915 B0.'
  );
  assert.ok(
    !res.output.includes('P6008'),
    '24.001mm tool must not call Laser P6008'
  );
});

test('B2.3: Micro-tool diameter 0.100mm evaluates geometry safely', () => {
  const harness = createV38Harness();
  const microTool = harness.createMockTool({
    number: 3,
    diameter: 0.100,
    fluteLength: 0.500,
    description: '0.1mm Micro Endmill'
  });

  const geom = harness.vmContext.calculateLaserMeasurementGeometry(microTool, 'wear');
  assert.ok(geom.x >= 0.040, 'Radial offset must be computed correctly');
  assert.ok(geom.z >= 0.100, 'Z measurement height must be clamped to at least 0.100mm');
});

test('B2.4: Inch unit program (unit = IN) refuses Laser NT calls and routes to Z-Nano', () => {
  const harness = createV38Harness();
  // Set unit to inch in the sandbox context
  harness.vmContext.unit = CONSTANTS.IN;

  const tool = harness.createMockTool({
    number: 4,
    diameter: 0.5, // 0.5 inch = 12.7mm
    description: '1/2 inch End Mill'
  });

  const isCapable = harness.vmContext.isLaserCapableTool(tool);
  assert.strictEqual(
    isCapable,
    false,
    'Tools in inch program mode must not be laser capable (Blum E18)'
  );

  const plan = harness.vmContext.getLengthPlan(tool);
  assert.strictEqual(
    plan.setter,
    'znano',
    'Inch program must route tool length to Z-Nano setter'
  );
});

test('B2.5: Conflicting tool lists (tool in both a4ZnanoTools and a5LaserTools) raises error', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2205,
    properties: {
      a4ZnanoTools: '5',
      a5LaserTools: '5',
      a2StartLengthMeasure: 'all'
    },
    tools: [{ number: 5, diameter: 10.0 }],
    sections: [{ toolNumber: 5 }]
  });

  assert.ok(
    res.errors.some(e => e.includes('both the Z-Nano and the Laser') || e.includes('CONFLICT')),
    'Conflicting tool lists must produce an error'
  );
});

test('B2.6: Preserved length register logic enables fast approach vs slow full search', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 2206,
    properties: {
      a1LengthMethod: 'laser',
      a2StartLengthMeasure: 'all'
    },
    tools: [{ number: 6, diameter: 10.0 }],
    sections: [{ toolNumber: 6 }]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Verify O6008 B-3.0 is commanded without any zeroing of #11006
  assert.ok(gcode.includes('P6008') && gcode.includes('B-3.'));
  assert.ok(!gcode.includes('#11006=0'));
  assert.ok(!gcode.includes('#10006=0'));
});

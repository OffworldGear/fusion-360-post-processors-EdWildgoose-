/**
 * adv_approach_modes_and_wear_separation.test.js - Tier 5: Adversarial Approach Modes & Wear Separation
 *
 * Attacks the B mode normalization, gating logic, table preservation, and
 * separation between Wear Update (B-1.0) and Check-Only (B-2.0).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  createV38Harness,
  CONSTANTS
} = require('../tier1_feature/test_helper.js');

const MACROS_V3_8_DIR = path.resolve(__dirname, '../../macros_v3_8');

test('ADV2.1: O6008.NC Mode B normalizes positive 3.0/2.0 and strictly rejects invalid B modes', () => {
  const o6008Path = path.join(MACROS_V3_8_DIR, 'O6008.NC');
  const content = fs.readFileSync(o6008Path, 'utf8');

  // Verify normalization logic
  assert.ok(content.includes('IF [#2 EQ 3.] GOTO 12'), 'Must detect B3.');
  assert.ok(content.includes('IF [#2 EQ 2.] GOTO 13'), 'Must detect B2.');
  assert.ok(content.includes('IF [#2 EQ -3.] GOTO 15'), 'Must accept B-3.');
  assert.ok(content.includes('IF [#2 EQ -2.] GOTO 15'), 'Must accept B-2.');
  assert.ok(content.includes('GOTO 9108'), 'Must branch to 9108 on invalid B');
  assert.ok(content.includes('#3000=108(BAD MODE B)'), 'Must alarm 9108 on invalid B');
});

test('ADV2.2: O6009.NC Mode B normalizes positive 1.0/2.0 and strictly rejects invalid B modes', () => {
  const o6009Path = path.join(MACROS_V3_8_DIR, 'O6009.NC');
  const content = fs.readFileSync(o6009Path, 'utf8');

  // Verify normalization logic
  assert.ok(content.includes('IF [#2 EQ 1.] GOTO 12'), 'Must detect B1.');
  assert.ok(content.includes('IF [#2 EQ 2.] GOTO 13'), 'Must detect B2.');
  assert.ok(content.includes('IF [#2 EQ -1.] GOTO 15'), 'Must accept B-1.');
  assert.ok(content.includes('IF [#2 EQ -2.] GOTO 15'), 'Must accept B-2.');
  assert.ok(content.includes('GOTO 9108'), 'Must branch to 9108 on invalid B');
  assert.ok(content.includes('#3000=108(BAD MODE B)'), 'Must alarm 9108 on invalid B');
});

test('ADV2.3: Zero-length gating in O6009.NC requires existing tool length between 50 and 200mm', () => {
  const o6009Path = path.join(MACROS_V3_8_DIR, 'O6009.NC');
  const content = fs.readFileSync(o6009Path, 'utf8');

  // Verify length gate
  assert.ok(
    content.includes('IF [#[11000 + #27] LT 50.] GOTO 9107'),
    'O6009 must reject tool length < 50mm'
  );
  assert.ok(
    content.includes('IF [#[11000 + #27] GT 200.] GOTO 9107'),
    'O6009 must reject tool length > 200mm'
  );
  assert.ok(
    content.includes('#3000=107(NO VALID TOOL LEN)'),
    'O6009 must trigger alarm 9107 on invalid length'
  );
});

test('ADV2.4: Neither O6008 nor O6009 clears tool length (#11000+T) or wear (#10000+T, #12000+T) registers', () => {
  for (const macro of ['O6008.NC', 'O6009.NC']) {
    const macroPath = path.join(MACROS_V3_8_DIR, macro);
    const content = fs.readFileSync(macroPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim().replace(/\([^)]*\)/g, ''); // strip comments
      const lengthWrite = line.match(/#\[\s*11000\s*\+\s*[^\]]+\s*\]\s*=/);
      const lenWearWrite = line.match(/#\[\s*10000\s*\+\s*[^\]]+\s*\]\s*=/);
      const diaWearWrite = line.match(/#\[\s*12000\s*\+\s*[^\]]+\s*\]\s*=/);

      assert.strictEqual(
        lengthWrite,
        null,
        `${macro}:${i + 1} must not clear or write tool length #[11000+T]`
      );
      assert.strictEqual(
        lenWearWrite,
        null,
        `${macro}:${i + 1} must not clear or write length wear #[10000+T]`
      );
      assert.strictEqual(
        diaWearWrite,
        null,
        `${macro}:${i + 1} must not clear cutter wear #[12000+T] directly (handled by Blum cycle)`
      );
    }
  }
});

test('ADV2.5: In-Cycle Wear Triggering Precedence (Wear Update over Check-Only)', () => {
  // Operation with conflicting [WEAR] and [CHECK] tags
  const harness1 = createV38Harness();
  const resBothTags = harness1.execute({
    programName: 8201,
    tools: [{ number: 5, diameter: 10.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 5,
      operationComment: 'Conflicting tags [CHECK] [WEAR]'
    }]
  });

  assert.strictEqual(resBothTags.errors.length, 0);
  assert.ok(
    resBothTags.output.includes('P6009') && resBothTags.output.includes('B-1.'),
    'Wear update must take precedence when both [WEAR] and [CHECK] are present'
  );

  // Operation with opUpdateWearBefore: true and [CHECK]
  const harness2 = createV38Harness();
  const resPropAndTag = harness2.execute({
    programName: 8202,
    tools: [{ number: 5, diameter: 10.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 5,
      opUpdateWearBefore: true,
      operationComment: 'Check tag [CHECK]'
    }]
  });

  assert.strictEqual(resPropAndTag.errors.length, 0);
  assert.ok(
    resPropAndTag.output.includes('P6009') && resPropAndTag.output.includes('B-1.'),
    'Checkbox opUpdateWearBefore must take precedence over [CHECK] tag'
  );
});

test('ADV2.6: Auto-wear before finish (a3bAutoWearBeforeFinish) is strictly conditional on Wear comp and stockToLeave == 0', () => {
  const harness = createV38Harness();

  // Case 1: Wear comp with stockToLeave == 0.0 -> TRIGGERS B-1.0
  const resFinish = harness.execute({
    programName: 8203,
    properties: { a3bAutoWearBeforeFinish: true },
    tools: [{ number: 6, diameter: 12.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 6,
      compensationType: 'wear',
      stockToLeave: 0.0
    }]
  });
  assert.strictEqual(resFinish.errors.length, 0);
  assert.ok(
    resFinish.output.includes('P6009') && resFinish.output.includes('B-1.'),
    'Must trigger wear update on Wear comp finishing pass with zero stock'
  );

  // Case 2: Wear comp with non-zero stock (semi-finish, stock = 0.25mm) -> DOES NOT TRIGGER
  const resSemiFinish = harness.execute({
    programName: 8204,
    properties: { a3bAutoWearBeforeFinish: true },
    tools: [{ number: 6, diameter: 12.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 6,
      compensationType: 'wear',
      stockToLeave: 0.25
    }]
  });
  assert.strictEqual(resSemiFinish.errors.length, 0);
  assert.ok(
    !resSemiFinish.output.includes('P6009'),
    'Must NOT trigger wear update when stock to leave > 0 (semi-finishing pass)'
  );

  // Case 3: Computer comp with stockToLeave == 0.0 -> DOES NOT TRIGGER
  const resCompFinish = harness.execute({
    programName: 8205,
    properties: { a3bAutoWearBeforeFinish: true },
    tools: [{ number: 6, diameter: 12.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 6,
      compensationType: 'computer',
      stockToLeave: 0.0
    }]
  });
  assert.strictEqual(resCompFinish.errors.length, 0);
  assert.ok(
    !resCompFinish.output.includes('P6009'),
    'Must NOT trigger wear update when compensationType is computer'
  );
});

test('ADV2.7: COMMAND_BREAK_CONTROL on milling cutters strictly uses B-2.0 and never modifies wear table', () => {
  const harness = createV38Harness();
  const res = harness.execute({
    programName: 8206,
    properties: {
      a1LengthMethod: 'laser'
    },
    tools: [{ number: 8, diameter: 10.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 8,
      commands: [CONSTANTS.COMMAND_BREAK_CONTROL]
    }]
  });

  assert.strictEqual(res.errors.length, 0);
  const gcode = res.output;

  // Must call O6009 with B-2.0 (Check-Only mode)
  assert.ok(
    gcode.includes('P6009') && gcode.includes('B-2.'),
    'COMMAND_BREAK_CONTROL on milling cutter must emit O6009 B-2.0'
  );
  assert.ok(
    !gcode.includes('B-1.'),
    'COMMAND_BREAK_CONTROL must never emit B-1.0 (Wear Update)'
  );
});

test('ADV2.8: Forensic Detection: lastWearCheckedSectionId lifecycle leak suppresses wear check across sequential jobs', () => {
  // This test proves that because lastWearCheckedSectionId is not reset in onOpen(),
  // running Job 1 with section 0 that checks wear leaks into Job 2 with section 0 and suppresses it!
  const harness = createV38Harness();

  // Job 1: runs opUpdateWearBefore on section 0
  const job1 = harness.execute({
    programName: 8208,
    tools: [{ number: 1, diameter: 10.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 1,
      opUpdateWearBefore: true
    }]
  });
  assert.strictEqual(job1.errors.length, 0);
  assert.ok(job1.output.includes('P6009'), 'Job 1 section 0 must execute O6009 wear check');

  // Job 2 on same VM context: also requests opUpdateWearBefore on section 0
  const job2 = harness.execute({
    programName: 8209,
    tools: [{ number: 2, diameter: 12.0, type: CONSTANTS.TOOL_MILLING_END_FLAT }],
    sections: [{
      toolNumber: 2,
      opUpdateWearBefore: true
    }]
  });

  // Fix verification: onOpen() resets lastWearCheckedSectionId = -1 so that sequential jobs
  // on a persistent VM execute wear checks cleanly on section 0 without state leakage
  const hasWearCheckInJob2 = job2.output.includes('P6009');
  assert.strictEqual(
    hasWearCheckInJob2,
    true,
    'Job 2 section 0 must execute O6009 wear check after state reset in onOpen()'
  );
});

#!/usr/bin/env node
/**
 * run_all.js - Master Test Runner for Brother Speedio C00 Post Processor & Macro Suite
 *
 * Executes the complete 4-tier E2E test suite plus test engine syntax validators:
 * - Tier 0: Engine & Syntax Validators (compiler, macro validator, harness)
 * - Tier 1: Feature Coverage (F1-F5: zero comp, length, wear update vs check, lollipop, probe)
 * - Tier 2: Boundary & Corner Cases (B1-B5: apertures, limits, registers, angles, ratios)
 * - Tier 3: Cross-Feature Combinations (Pairwise Combinations Matrix)
 * - Tier 4: Real-World Application Scenarios (Aerospace, Mold, Production, Face Mill, Hard Milling)
 *
 * Usage:
 *   node tests/run_all.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

// Test suite definition organized by tier
const SUITES = [
  {
    tier: 'Tier 0',
    title: 'Engine & Syntax Validators',
    files: [
      path.join(REPO_ROOT, 'tests/test_validators.js')
    ]
  },
  {
    tier: 'Tier 1',
    title: 'Feature Coverage (F1 - F5)',
    files: [
      path.join(REPO_ROOT, 'tests/tier1_feature/f1_zero_cutter_comp.test.js'),
      path.join(REPO_ROOT, 'tests/tier1_feature/f2_znano_laser_length.test.js'),
      path.join(REPO_ROOT, 'tests/tier1_feature/f3_wear_update_vs_check.test.js'),
      path.join(REPO_ROOT, 'tests/tier1_feature/f4_lollipop_wear_contour.test.js'),
      path.join(REPO_ROOT, 'tests/tier1_feature/f5_touch_probe_wear.test.js')
    ]
  },
  {
    tier: 'Tier 2',
    title: 'Boundary & Corner Cases (B1 - B5)',
    files: [
      path.join(REPO_ROOT, 'tests/tier2_boundary/b1_zero_comp_boundaries.test.js'),
      path.join(REPO_ROOT, 'tests/tier2_boundary/b2_aperture_and_setter_boundaries.test.js'),
      path.join(REPO_ROOT, 'tests/tier2_boundary/b3_wear_limits_and_tolerances.test.js'),
      path.join(REPO_ROOT, 'tests/tier2_boundary/b4_lollipop_angle_boundaries.test.js'),
      path.join(REPO_ROOT, 'tests/tier2_boundary/b5_touch_probe_boundaries.test.js')
    ]
  },
  {
    tier: 'Tier 3',
    title: 'Cross-Feature Pairwise Combinations Matrix',
    files: [
      path.join(REPO_ROOT, 'tests/tier3_pairwise/pairwise_combinations.test.js')
    ]
  },
  {
    tier: 'Tier 4',
    title: 'Real-World Production Application Scenarios',
    files: [
      path.join(REPO_ROOT, 'tests/tier4_realworld/scenario1_aerospace_bracket.test.js'),
      path.join(REPO_ROOT, 'tests/tier4_realworld/scenario2_deep_cavity_mold.test.js'),
      path.join(REPO_ROOT, 'tests/tier4_realworld/scenario3_drilling_tapping.test.js'),
      path.join(REPO_ROOT, 'tests/tier4_realworld/scenario4_large_facemill.test.js'),
      path.join(REPO_ROOT, 'tests/tier4_realworld/scenario5_hard_milling_probe.test.js')
    ]
  },
  {
    tier: 'Tier 5',
    title: 'White-Box Adversarial Hardening & Fuzzing',
    files: [
      path.join(REPO_ROOT, 'tests/tier5_adversarial/adv_zero_comp_fuzzer.test.js'),
      path.join(REPO_ROOT, 'tests/tier5_adversarial/adv_approach_modes_and_wear_separation.test.js'),
      path.join(REPO_ROOT, 'tests/tier5_adversarial/adv_lollipop_kinematics_fuzzer.test.js'),
      path.join(REPO_ROOT, 'tests/tier5_adversarial/adv_break_control_and_touch_probe.test.js'),
      path.join(REPO_ROOT, 'tests/tier5_adversarial/adv_modal_state_restoration.test.js'),
      path.join(REPO_ROOT, 'tests/tier5_adversarial/challenger2_fuzzing_invariants.test.js')
    ]
  }
];

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function parseTestOutput(stdout) {
  const lines = stdout.split('\n');
  const tests = [];
  let passCount = 0;
  let failCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('✔')) {
      passCount++;
      tests.push({ status: 'PASS', name: trimmed.substring(2) });
    } else if (trimmed.startsWith('✖') && !trimmed.startsWith('✖ failing tests:')) {
      failCount++;
      tests.push({ status: 'FAIL', name: trimmed.substring(2) });
    }
  }

  return { tests, passCount, failCount };
}

function runAll() {
  const startTime = Date.now();

  console.log('='.repeat(80));
  console.log('Brother Speedio C00 (v3.8) & Blum Macro Suite - Master E2E Test Runner');
  console.log('='.repeat(80));
  console.log(`Node.js Version: ${process.version}`);
  console.log(`Repository Root: ${REPO_ROOT}`);
  console.log(`Execution Time:  ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  console.log('');

  let totalPass = 0;
  let totalFail = 0;
  let totalFiles = 0;
  const tierResults = [];
  const failureReports = [];

  for (const suite of SUITES) {
    console.log(`>>> ${suite.tier}: ${suite.title}`);
    console.log('-'.repeat(80));

    const tierStart = Date.now();
    let tierPass = 0;
    let tierFail = 0;

    for (const testFile of suite.files) {
      totalFiles++;
      const relPath = path.relative(REPO_ROOT, testFile).replace(/\\/g, '/');

      if (!fs.existsSync(testFile)) {
        console.log(`  [MISSING] ${relPath}`);
        tierFail++;
        totalFail++;
        failureReports.push({ file: relPath, error: 'File not found' });
        continue;
      }

      const fileStart = Date.now();
      const res = spawnSync(process.execPath, [testFile], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: Object.assign({}, process.env)
      });
      const fileDuration = Date.now() - fileStart;

      const parsed = parseTestOutput(res.stdout || '');
      tierPass += parsed.passCount;
      tierFail += parsed.failCount;
      totalPass += parsed.passCount;
      totalFail += parsed.failCount;

      const statusTag = (res.status === 0 && parsed.failCount === 0) ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`  [${statusTag}] ${relPath} (${parsed.passCount} passed, ${parsed.failCount} failed, ${formatDuration(fileDuration)})`);

      // Print individual test lines if failed
      if (res.status !== 0 || parsed.failCount > 0) {
        console.log(`    \x1b[31mFailure output:\x1b[0m`);
        const errOut = (res.stderr || res.stdout || '').trim();
        const errLines = errOut.split('\n').slice(-15).map(l => `      ${l}`).join('\n');
        console.log(errLines);
        failureReports.push({ file: relPath, error: errOut });
      }
    }

    const tierDuration = Date.now() - tierStart;
    tierResults.push({
      tier: suite.tier,
      title: suite.title,
      pass: tierPass,
      fail: tierFail,
      total: tierPass + tierFail,
      duration: tierDuration
    });

    console.log(`  Subtotal: ${tierPass} passed, ${tierFail} failed (${formatDuration(tierDuration)})`);
    console.log('');
  }

  const overallDuration = Date.now() - startTime;

  // Print Summary Table
  console.log('='.repeat(80));
  console.log('E2E TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(
    'Tier'.padEnd(10) +
    'Title'.padEnd(46) +
    'Tests'.padStart(8) +
    'Pass'.padStart(8) +
    'Fail'.padStart(8)
  );
  console.log('-'.repeat(80));

  for (const tr of tierResults) {
    const statusCol = tr.fail === 0 ? `${tr.pass}` : `${tr.pass}`;
    console.log(
      tr.tier.padEnd(10) +
      tr.title.substring(0, 44).padEnd(46) +
      String(tr.total).padStart(8) +
      String(tr.pass).padStart(8) +
      String(tr.fail).padStart(8)
    );
  }

  console.log('-'.repeat(80));
  console.log(
    'TOTAL'.padEnd(10) +
    `${totalFiles} test files executed`.padEnd(46) +
    String(totalPass + totalFail).padStart(8) +
    String(totalPass).padStart(8) +
    String(totalFail).padStart(8)
  );
  console.log(`Duration: ${formatDuration(overallDuration)}`);
  console.log('='.repeat(80));

  if (totalFail > 0) {
    console.log(`\n\x1b[31mFAILED: ${totalFail} test(s) failed across ${failureReports.length} file(s).\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\n\x1b[32mSUCCESS: All ${totalPass} tests passed cleanly across all 5 tiers (100% pass rate)!\x1b[0m`);
    process.exit(0);
  }
}

runAll();

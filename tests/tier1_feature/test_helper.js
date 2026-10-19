/**
 * test_helper.js - Shared Test Utilities and Extended Post Processor Sandbox
 *
 * Provides the ExtendedPostHarness which adds full Fusion 360 CAM lifecycle emulation:
 * - Section-level property inspection (opUpdateWearBefore, opLaserWear, opMeasureLength)
 * - Section-level parameter inspection (operation:compensationType, operation:stockToLeave)
 * - In-cycle Manual NC action dispatch (onAction)
 * - In-cycle command dispatch (onCommand)
 * - In-cycle probing cycle dispatch (writeProbeCycle)
 * - Path resolution to post processors and macro suites
 */

'use strict';

const path = require('node:path');
const assert = require('node:assert');
const { FusionPostHarness, CONSTANTS, Vector, Matrix } = require('../lib/fusion_harness.js');
const { validateMacroFile, validateMacroString } = require('../lib/macro_validator.js');
const { validateCpsFile, validateCpsString } = require('../lib/cps_compiler.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const V3_8_CPS_PATH = path.join(REPO_ROOT, 'OWGMods-edwildgoose6-24-26-patched-v3_8.cps');
const V3_7_CPS_PATH = path.join(REPO_ROOT, 'OWGMods-edwildgoose6-24-26-patched-v3_7.cps');
const MACROS_V3_8_DIR = path.join(REPO_ROOT, 'macros_v3_8');
const MACROS_V3_7_DIR = path.join(REPO_ROOT, 'macros');

/**
 * Extended post processor harness with rich operation parameters,
 * manual actions, command execution, and probing cycle integration.
 */
class ExtendedPostHarness extends FusionPostHarness {
  constructor() {
    super();
  }

  /**
   * Overrides createMockSection to ensure CAM parameters, properties,
   * cycles, and comments are fully accessible to the post processor.
   */
  createMockSection(sectionData = {}, sectionId = 0) {
    const sec = super.createMockSection(sectionData, sectionId);

    // Initialize parameters dictionary
    sec.parameters = Object.assign({}, sectionData.parameters || {});
    if (sectionData.compensationType !== undefined) {
      sec.parameters['operation:compensationType'] = sectionData.compensationType;
    }
    if (sectionData.stockToLeave !== undefined) {
      sec.parameters['operation:stockToLeave'] = sectionData.stockToLeave;
    }
    if (sectionData.radialStockToLeave !== undefined) {
      sec.parameters['operation:radialStockToLeave'] = sectionData.radialStockToLeave;
    }
    if (sectionData.axialStockToLeave !== undefined) {
      sec.parameters['operation:axialStockToLeave'] = sectionData.axialStockToLeave;
    }
    if (sectionData.operationComment !== undefined) {
      sec.parameters['operation-comment'] = sectionData.operationComment;
    }
    if (sectionData.printResults !== undefined) {
      sec.parameters['printResults'] = sectionData.printResults ? 1 : 0;
    } else if (sectionData.cycle && sectionData.cycle.printResults) {
      sec.parameters['printResults'] = 1;
    }
    if (sectionData.cycle && sectionData.cycle.cycleID !== undefined) {
      sec.parameters['cycleID'] = sectionData.cycle.cycleID;
    } else if (sectionData.cycle) {
      sec.parameters['cycleID'] = 1;
    }
    if (sec.parameters['autodeskcam:operation-id'] === undefined) {
      sec.parameters['autodeskcam:operation-id'] = sectionId + 1;
    }

    // Initialize properties dictionary (operation Post Process tab)
    sec.properties = Object.assign({}, sectionData.properties || {});
    if (sectionData.opUpdateWearBefore !== undefined) {
      sec.properties.opUpdateWearBefore = sectionData.opUpdateWearBefore;
      sec.opUpdateWearBefore = sectionData.opUpdateWearBefore;
    }
    if (sectionData.opLaserWear !== undefined) {
      sec.properties.opLaserWear = sectionData.opLaserWear;
      sec.opLaserWear = sectionData.opLaserWear;
    }
    if (sectionData.opMeasureLength !== undefined) {
      sec.properties.opMeasureLength = sectionData.opMeasureLength;
      sec.opMeasureLength = sectionData.opMeasureLength;
    }

    // Override getProperty and getParameter for full fidelity
    sec.getProperty = (name, def) => {
      if (sec.properties && sec.properties[name] !== undefined) return sec.properties[name];
      if (sectionData[name] !== undefined) return sectionData[name];
      return def;
    };

    sec.getParameter = (name, def) => {
      if (sec.parameters && sec.parameters[name] !== undefined) return sec.parameters[name];
      if (name === 'operation-comment') return sectionData.operationComment || `Operation ${sectionId + 1}`;
      return def;
    };

    sec.hasParameter = (name) => {
      if (name === 'operation-comment') return true;
      return Boolean(sec.parameters && sec.parameters[name] !== undefined);
    };

    if (sectionData.probeWorkOffset !== undefined) {
      sec.probeWorkOffset = sectionData.probeWorkOffset;
    } else {
      sec.probeWorkOffset = 1; // Default to WCS 1 (G54)
    }

    if (sectionData.strategy) {
      sec.strategy = sectionData.strategy;
    }

    return sec;
  }

  /**
   * Enhanced execution supporting in-cycle actions, commands, and probing cycles.
   */
  execute(jobSpec = {}) {
    if (!this.vmContext) {
      throw new Error('Post processor not loaded. Call loadPost(filePath) first.');
    }

    this.reset();
    const ctx = this.vmContext;

    if (jobSpec.programName !== undefined) {
      ctx.programName = jobSpec.programName;
    }
    if (jobSpec.programComment !== undefined) {
      ctx.programComment = jobSpec.programComment;
    }
    if (jobSpec.unit !== undefined) {
      ctx.unit = jobSpec.unit;
    }
    if (jobSpec.globalParameters) {
      ctx.globalParameters = Object.assign({}, jobSpec.globalParameters);
    } else {
      ctx.globalParameters = { 'job-description': 'SETUP1' };
    }

    // Post-level property overrides
    if (jobSpec.properties) {
      for (const [key, val] of Object.entries(jobSpec.properties)) {
        if (ctx.properties[key] !== null && typeof ctx.properties[key] === 'object' && 'value' in ctx.properties[key]) {
          ctx.properties[key].value = val;
        } else {
          ctx.properties[key] = val;
        }
      }
    }

    // Tools
    const rawTools = jobSpec.tools || [];
    let toolList = rawTools.map(t => this.createMockTool(t));
    if (toolList.length === 0) {
      toolList.push(this.createMockTool({ number: 1, diameter: 10.0 }));
    }
    ctx.tools = toolList;

    // Sections
    const rawSections = jobSpec.sections || [{}];
    const sectionList = rawSections.map((s, idx) => {
      if (!s.tool && s.toolNumber) {
        const found = toolList.find(t => t.number === s.toolNumber);
        if (found) s.tool = found;
      }
      return this.createMockSection(s, idx);
    });
    ctx.sections = sectionList;

    // Static Matrix.diff binding for workplane comparisons
    if (!ctx.Matrix.diff) {
      ctx.Matrix.diff = (m1, m2) => {
        const dF = Vector.diff(m1.forward || new Vector(0, 0, 1), m2.forward || new Vector(0, 0, 1));
        return { isZero: () => dF.isZero() };
      };
    }

    // Fix Autodesk Post engine isToolChangeNeeded signature compatibility (both 1-arg and 2-arg)
    ctx.isToolChangeNeeded = (arg1, arg2) => {
      if (typeof arg1 === 'string' || arg1 === undefined) {
        // Called as isToolChangeNeeded("number") from onSection comparing with previous section
        if (!ctx.currentSection || ctx.isFirstSection()) return true;
        const prevSec = typeof ctx.getPreviousSection === 'function' ? ctx.getPreviousSection() : null;
        if (!prevSec || typeof prevSec.getTool !== 'function') return true;
        const prevTool = prevSec.getTool();
        const curTool = ctx.tool || (ctx.currentSection && typeof ctx.currentSection.getTool === 'function' ? ctx.currentSection.getTool() : null);
        if (!prevTool || !curTool) return true;
        if (arg1 === 'description') return prevTool.description !== curTool.description;
        return prevTool.number !== curTool.number;
      } else {
        // Called as isToolChangeNeeded(getNextSection(), "number") from onSectionEnd
        const nextSec = arg1;
        const mode = arg2;
        if (!nextSec) return false;
        const nextTool = typeof nextSec.getTool === 'function' ? nextSec.getTool() : nextSec.tool;
        const curTool = ctx.tool || (ctx.currentSection && typeof ctx.currentSection.getTool === 'function' ? ctx.currentSection.getTool() : null);
        if (!nextTool || !curTool) return false;
        if (mode === 'description') return nextTool.description !== curTool.description;
        return nextTool.number !== curTool.number;
      }
    };

    try {
      // 1. onOpen()
      if (typeof ctx.onOpen === 'function') {
        ctx.onOpen();
      }

      // 2. Iterate sections
      for (let i = 0; i < sectionList.length; i++) {
        const sec = sectionList[i];
        const rawSec = rawSections[i] || {};
        ctx.currentSection = sec;
        ctx.tool = sec.tool;
        ctx.spindleSpeed = sec.spindleSpeed;

        if (typeof ctx.onSection === 'function') {
          ctx.onSection();
        }

        // In-cycle Manual NC actions before or during cutting
        if (rawSec.actions && Array.isArray(rawSec.actions)) {
          for (const act of rawSec.actions) {
            if (typeof ctx.onAction === 'function') ctx.onAction(act);
          }
        }
        if (rawSec.action && typeof ctx.onAction === 'function') {
          ctx.onAction(rawSec.action);
        }

        // Cutting / positioning moves
        if (rawSec.moves && Array.isArray(rawSec.moves)) {
          for (const mv of rawSec.moves) {
            if (mv.movement !== undefined && typeof ctx.onMovement === 'function') {
              ctx.movement = mv.movement;
              ctx.onMovement(mv.movement);
            }
            if (mv.radiusCompensation !== undefined && typeof ctx.onRadiusCompensation === 'function') {
              ctx.radiusCompensation = mv.radiusCompensation;
              ctx.onRadiusCompensation();
            }
            if (mv.type === 'rapid' && typeof ctx.onRapid === 'function') {
              ctx.onRapid(mv.x, mv.y, mv.z);
              ctx.setCurrentPosition(new Vector(mv.x, mv.y, mv.z));
            } else if (mv.type === 'linear' && typeof ctx.onLinear === 'function') {
              ctx.onLinear(mv.x, mv.y, mv.z, mv.feed || sec.feedrate || 1000);
              ctx.setCurrentPosition(new Vector(mv.x, mv.y, mv.z));
            } else if (mv.type === 'circular' && typeof ctx.onCircular === 'function') {
              ctx.onCircular(!!mv.clockwise, mv.cx || 0, mv.cy || 0, mv.cz || 0, mv.x, mv.y, mv.z, mv.feed || sec.feedrate || 1000);
              ctx.setCurrentPosition(new Vector(mv.x, mv.y, mv.z));
            }
          }
        }

        // Cycle execution (Probing, Drilling, Tapping, Boring, Inspection)
        if (rawSec.cycle) {
          const cycleObj = Object.assign({
            feedrate: sec.feedrate || 1000,
            retract: 25.0,
            bottom: -5.0,
            depth: 5.0,
            clearance: 50.0,
            probeClearance: 2.0,
            probeOvertravel: 1.0,
            incrementComponent: 0
          }, rawSec.cycle);
          ctx.cycle = cycleObj;
          ctx.cycleType = rawSec.cycleType || cycleObj.type;
          const pts = Array.isArray(rawSec.cyclePoints) && rawSec.cyclePoints.length > 0
            ? rawSec.cyclePoints
            : [{
              x: rawSec.cycleX !== undefined ? rawSec.cycleX : 0,
              y: rawSec.cycleY !== undefined ? rawSec.cycleY : 0,
              z: rawSec.cycleZ !== undefined ? rawSec.cycleZ : 25.0
            }];
          if (typeof ctx.onCycle === 'function') {
            ctx.onCycle();
          }
          for (let pi = 0; pi < pts.length; pi++) {
            const pt = pts[pi];
            ctx.isFirstCyclePoint = () => pi === 0;
            if (typeof ctx.onCyclePoint === 'function') {
              ctx.onCyclePoint(pt.x, pt.y, pt.z);
            } else if (typeof ctx.writeProbeCycle === 'function') {
              ctx.writeProbeCycle(cycleObj, pt.x, pt.y, pt.z);
            }
          }
          ctx.isFirstCyclePoint = () => true;
          if (typeof ctx.onCycleEnd === 'function') {
            ctx.onCycleEnd();
          }
        }

        // Section commands
        if (rawSec.commands && Array.isArray(rawSec.commands)) {
          for (const cmd of rawSec.commands) {
            if (typeof ctx.onCommand === 'function') ctx.onCommand(cmd);
          }
        }
        if (rawSec.command !== undefined && typeof ctx.onCommand === 'function') {
          ctx.onCommand(rawSec.command);
        }

        // Job-level inter-section commands
        if (Array.isArray(jobSpec.commands)) {
          for (const cmd of jobSpec.commands) {
            if (typeof ctx.onCommand === 'function') ctx.onCommand(cmd);
          }
        }

        if (typeof ctx.onSectionEnd === 'function') {
          ctx.onSectionEnd();
        }
      }

      // 3. onClose()
      if (typeof ctx.onClose === 'function') {
        ctx.onClose();
      }
    } catch (err) {
      this.errors.push(err.message || String(err));
    }

    return {
      output: this.getOutput(),
      blocks: this.getBlocks(),
      errors: this.getErrors(),
      warnings: this.getWarnings()
    };
  }
}

/**
 * Creates and loads a fresh ExtendedPostHarness instance with v3_8.cps.
 */
function createV38Harness() {
  const harness = new ExtendedPostHarness();
  harness.loadPost(V3_8_CPS_PATH);
  return harness;
}

/**
 * Helper to assert that #[13000+T] is NEVER assigned any non-zero value,
 * and that zero-comp guards are properly present.
 */
function assertZeroCompInvariants(gcode, expectedTools = []) {
  const lines = gcode.split('\r\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Match #[13000 + ...] = <val> or #13001 = <val>
    const matchDyn = trimmed.match(/^#\[\s*13000\s*\+\s*[^\]]+\s*\]\s*=\s*([^(\s]+)/);
    const matchFixed = trimmed.match(/^#130(\d{2})\s*=\s*([^(\s]+)/);

    if (matchDyn) {
      const val = parseFloat(matchDyn[1]);
      assert.strictEqual(
        val,
        0,
        `Dynamic cutter comp geometry register #[13000+...] must be 0, found: ${trimmed}`
      );
    }
    if (matchFixed) {
      const val = parseFloat(matchFixed[2]);
      assert.strictEqual(
        val,
        0,
        `Fixed cutter comp geometry register #130XX must be 0, found: ${trimmed}`
      );
    }
  }

  // Ensure start guards zeroed each expected tool
  for (const t of expectedTools) {
    const padT = String(t).padStart(2, '0');
    const startZeroFixed = `#130${padT}=0.`;
    const startZeroDyn = `#[13000+${t}]=0.`;
    const hasZero = gcode.includes(startZeroFixed) || gcode.includes(startZeroDyn) || gcode.includes(`#1300${t}=0.`);
    assert.ok(
      hasZero,
      `Program start guard must zero cutter comp for tool ${t}`
    );
  }
}

module.exports = {
  ExtendedPostHarness,
  createV38Harness,
  assertZeroCompInvariants,
  CONSTANTS,
  Vector,
  Matrix,
  V3_8_CPS_PATH,
  V3_7_CPS_PATH,
  MACROS_V3_8_DIR,
  MACROS_V3_7_DIR,
  validateMacroFile,
  validateMacroString,
  validateCpsFile,
  validateCpsString
};

/**
 * fusion_harness.js - Autodesk Fusion 360 Post Processor Execution Sandbox
 *
 * Implements a mock Autodesk CAM post execution environment using Node.js node:vm.
 * Provides complete emulation of the Autodesk Post Processor Engine runtime:
 * - CAM formatters (createFormat, createOutputVariable, createModal, createReferenceVariable)
 * - Vector, Matrix, and spatial transformation primitives
 * - Autodesk CAM constants (TOOL_*, COMMAND_*, COOLANT_*, MOVEMENT_*, FEED_*, etc.)
 * - Section & tool state machines
 * - Output writers (writeln, writeWords, writeWords2, formatWords, writeComment)
 * - Lifecycle handlers (onOpen, onSection, onSectionEnd, onCommand, onClose)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// --- CAM Constants ---

const CONSTANTS = {
  // Units
  MM: 1,
  IN: 0,
  DEG: 180 / Math.PI,
  RAD: Math.PI / 180,
  EOL: '\r\n',
  SP: ' ',

  // Capabilities & Formats
  CAPABILITY_MILLING: 1,
  CAPABILITY_TURNING: 2,
  CAPABILITY_JET: 4,
  CAPABILITY_MACHINE_SIMULATION: 8,
  FEATURE_MACHINE_ROTARY_ANGLES: 1,
  FORMAT_REAL: 0,
  FORMAT_INTEGER: 1,
  CONTROL_FORCE: 1,
  CONTROL_NONZERO: 2,

  // Section Types
  TYPE_MILLING: 1,
  TYPE_TURNING: 2,
  TYPE_JET: 3,

  // Planes
  PLANE_XY: 0,
  PLANE_ZX: 1,
  PLANE_YZ: 2,

  // Radius Compensation
  RADIUS_COMPENSATION_OFF: 0,
  RADIUS_COMPENSATION_LEFT: 1,
  RADIUS_COMPENSATION_RIGHT: 2,

  // High Feed Mapping
  HIGH_FEED_NO_MAPPING: 0,
  HIGH_FEED_MAP_ANY: 1,
  HIGH_FEED_MAP_MULTI: 2,

  // Axes
  X: 0,
  Y: 1,
  Z: 2,
  A: 3,
  B: 4,
  C: 5,
  ABC: 'ABC',

  // Feed Modes
  FEED_FPM: 1,
  FEED_DPM: 2,
  FEED_INVERSE_TIME: 3,
  INVERSE_MINUTES: 1,
  DPM_COMBINATION: 2,
  PREFER_PREFERENCE: 1,
  ENABLE_ALL: 1,
  EULER_ZXZ_R: 1,
  EULER_XYZ_R: 2,
  EULER_ZXZ_S: 3,
  EULER_XYZ_S: 4,
  POLAR_MODE_OFF: 0,
  OPTIMIZE_AXIS: 1,
  OPTIMIZE_NONE: 0,
  OPTIMIZE_BOTH: 2,
  OPTIMIZE_TABLES: 3,
  OPTIMIZE_HEADS: 4,

  // Tool Types
  TOOL_MILLING_END_FLAT: 1,
  TOOL_MILLING_END_BALL: 2,
  TOOL_MILLING_END_BULLNOSE: 3,
  TOOL_MILLING_CHAMFER: 4,
  TOOL_MILLING_FACE: 5,
  TOOL_MILLING_SLOT: 6,
  TOOL_MILLING_RADIUS: 7,
  TOOL_MILLING_DOVETAIL: 8,
  TOOL_MILLING_TAPERED: 9,
  TOOL_MILLING_LOLLIPOP: 10,
  TOOL_DRILL: 11,
  TOOL_DRILL_CENTER: 12,
  TOOL_DRILL_SPOT: 13,
  TOOL_DRILL_BLOCK: 14,
  TOOL_COUNTER_BORE: 15,
  TOOL_COUNTER_SINK: 16,
  TOOL_REAMER: 17,
  TOOL_TAP_RIGHT_HAND: 18,
  TOOL_TAP_LEFT_HAND: 19,
  TOOL_BORING_BAR: 20,
  TOOL_PROBE: 21,

  // Coolant Types
  COOLANT_OFF: 0,
  COOLANT_FLOOD: 1,
  COOLANT_MIST: 2,
  COOLANT_THROUGH_TOOL: 3,
  COOLANT_AIR: 4,
  COOLANT_AIR_THROUGH_TOOL: 5,
  COOLANT_SUCTION: 6,
  COOLANT_FLOOD_MIST: 7,
  COOLANT_FLOOD_THROUGH_TOOL: 8,

  // CAM Commands
  COMMAND_STOP: 0,
  COMMAND_OPTIONAL_STOP: 1,
  COMMAND_END: 2,
  COMMAND_SPINDLE_CLOCKWISE: 3,
  COMMAND_SPINDLE_COUNTERCLOCKWISE: 4,
  COMMAND_STOP_SPINDLE: 5,
  COMMAND_ORIENTATE_SPINDLE: 6,
  COMMAND_COOLANT_ON: 7,
  COMMAND_COOLANT_OFF: 8,
  COMMAND_TOOL_MEASURE: 9,
  COMMAND_BREAK_CONTROL: 10,
  COMMAND_VERIFY: 11,
  COMMAND_START_CHIP_TRANSPORT: 12,
  COMMAND_STOP_CHIP_TRANSPORT: 13,
  COMMAND_LOAD_TOOL: 14,
  COMMAND_LOCK_MULTI_AXIS: 15,
  COMMAND_UNLOCK_MULTI_AXIS: 16,
  COMMAND_PROBE_ON: 17,
  COMMAND_PROBE_OFF: 18,
  COMMAND_START_SPINDLE: 19,
  COMMAND_CLEAN: 20,

  // Movement Types
  MOVEMENT_RAPID: 1,
  MOVEMENT_LEAD_IN: 2,
  MOVEMENT_CUTTING: 3,
  MOVEMENT_LEAD_OUT: 4,
  MOVEMENT_LINK_DIRECT: 5,
  MOVEMENT_LINK_TRANSITION: 6,
  MOVEMENT_HIGH_FEED: 7,
  MOVEMENT_PLUNGE: 8,
  MOVEMENT_RAMP: 9,
  MOVEMENT_RAMP_ZIG_ZAG: 10,
  MOVEMENT_RAMP_PROFILE: 11,
  MOVEMENT_RAMP_HELIX: 12
};

// --- Vector Math Primitive ---

class Vector {
  constructor(x = 0, y = 0, z = 0) {
    if (typeof x === 'object' && x !== null) {
      this.x = Number(x.x || 0);
      this.y = Number(x.y || 0);
      this.z = Number(x.z || 0);
    } else {
      this.x = Number(x || 0);
      this.y = Number(y || 0);
      this.z = Number(z || 0);
    }
  }

  get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  get unit() {
    const len = this.length;
    if (len === 0) return new Vector(0, 0, 0);
    return new Vector(this.x / len, this.y / len, this.z / len);
  }

  get coordinate() {
    return [this.x, this.y, this.z];
  }

  static diff(a, b) {
    const ax = a ? Number(a.x || 0) : 0;
    const ay = a ? Number(a.y || 0) : 0;
    const az = a ? Number(a.z || 0) : 0;
    const bx = b ? Number(b.x || 0) : 0;
    const by = b ? Number(b.y || 0) : 0;
    const bz = b ? Number(b.z || 0) : 0;
    return new Vector(ax - bx, ay - by, az - bz);
  }

  static dot(a, b) {
    const ax = a ? Number(a.x || 0) : 0;
    const ay = a ? Number(a.y || 0) : 0;
    const az = a ? Number(a.z || 0) : 0;
    const bx = b ? Number(b.x || 0) : 0;
    const by = b ? Number(b.y || 0) : 0;
    const bz = b ? Number(b.z || 0) : 0;
    return ax * bx + ay * by + az * bz;
  }

  static cross(a, b) {
    const ax = a ? Number(a.x || 0) : 0;
    const ay = a ? Number(a.y || 0) : 0;
    const az = a ? Number(a.z || 0) : 0;
    const bx = b ? Number(b.x || 0) : 0;
    const by = b ? Number(b.y || 0) : 0;
    const bz = b ? Number(b.z || 0) : 0;
    return new Vector(
      ay * bz - az * by,
      az * bx - ax * bz,
      ax * by - ay * bx
    );
  }

  isZero() {
    return Math.abs(this.x) < 1e-9 && Math.abs(this.y) < 1e-9 && Math.abs(this.z) < 1e-9;
  }

  isNonZero() {
    return !this.isZero();
  }

  getNormalized() {
    return this.unit;
  }

  getAbsolute() {
    return new Vector(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z));
  }
}

// --- Matrix Primitive ---

class Matrix {
  constructor(v1, v2, v3) {
    if (v1 instanceof Vector && v2 instanceof Vector && v3 instanceof Vector) {
      this.m = [
        v1.x, v2.x, v3.x,
        v1.y, v2.y, v3.y,
        v1.z, v2.z, v3.z
      ];
    } else {
      this.m = [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
      ];
    }
  }

  static diff(m1, m2) {
    const f1 = (m1 && m1.forward) ? m1.forward : new Vector(0, 0, 1);
    const f2 = (m2 && m2.forward) ? m2.forward : new Vector(0, 0, 1);
    return Vector.diff(f1, f2);
  }

  get forward() {
    return new Vector(this.m[2], this.m[5], this.m[8]);
  }

  set forward(v) {
    if (v) {
      this.m[2] = v.x;
      this.m[5] = v.y;
      this.m[8] = v.z;
    }
  }

  get right() {
    return new Vector(this.m[0], this.m[3], this.m[6]);
  }

  get up() {
    return new Vector(this.m[1], this.m[4], this.m[7]);
  }

  getTransposed() {
    const res = new Matrix();
    res.m = [
      this.m[0], this.m[3], this.m[6],
      this.m[1], this.m[4], this.m[7],
      this.m[2], this.m[5], this.m[8]
    ];
    return res;
  }

  multiply(v) {
    return new Vector(
      this.m[0] * v.x + this.m[1] * v.y + this.m[2] * v.z,
      this.m[3] * v.x + this.m[4] * v.y + this.m[5] * v.z,
      this.m[6] * v.x + this.m[7] * v.y + this.m[8] * v.z
    );
  }

  getEuler2(convention) {
    return new Vector(0, 0, 0);
  }
}

// --- Argument Flattener ---

function flattenArgs(args) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const item = args[i];
    if (item === undefined || item === null) continue;
    if (Array.isArray(item)) {
      result.push(...flattenArgs(item));
    } else if (typeof item === 'object' && typeof item.length === 'number' && typeof item !== 'string' && !(item instanceof Vector) && !(item instanceof Matrix)) {
      // Arguments object
      result.push(...flattenArgs(Array.from(item)));
    } else {
      result.push(item);
    }
  }
  return result;
}

// --- Formatters & Output Variables ---

function createFormatHelper(spec = {}) {
  const decimals = spec.decimals !== undefined ? spec.decimals : 3;
  const forceDecimal = spec.forceDecimal !== undefined ? spec.forceDecimal : false;
  const trimLeadingZero = spec.trimLeadingZero !== undefined ? spec.trimLeadingZero : false;
  const trimTrailingZeros = spec.trim !== undefined ? spec.trim : false;
  const scale = spec.scale !== undefined ? spec.scale : 1;
  const offset = spec.offset !== undefined ? spec.offset : 0;
  const prefix = spec.prefix || '';
  const suffix = spec.suffix || '';

  const helper = {
    format: function(val) {
      if (val === undefined || val === null) return '';
      let num = (Number(val) + offset) * scale;
      let str = num.toFixed(decimals);

      if (trimTrailingZeros && str.includes('.')) {
        str = str.replace(/\.?0+$/, '');
      }
      if (!forceDecimal && str.endsWith('.')) {
        str = str.slice(0, -1);
      }
      if (trimLeadingZero && str.startsWith('0.')) {
        str = str.substring(1);
      }
      return prefix + str + suffix;
    },
    getResultingValue: function(val) {
      if (val === undefined || val === null) return 0;
      return Number(((Number(val) + offset) * scale).toFixed(decimals));
    },
    isSignificant: function(val) {
      return Math.abs(val) >= Math.pow(10, -decimals);
    },
    areDifferent: function(a, b) {
      if (a === undefined || a === null || b === undefined || b === null) return a !== b;
      return Math.abs(helper.getResultingValue(a) - helper.getResultingValue(b)) >= Math.pow(10, -decimals);
    },
    getMinimum: function() { return spec.minimum || -999999; },
    getMaximum: function() { return spec.maximum || 999999; },
    getDecimals: function() { return decimals; }
  };

  return helper;
}

function createOutputVariableHelper(spec = {}, formatObj) {
  const prefix = spec.prefix !== undefined ? spec.prefix : '';
  const force = spec.force !== undefined ? spec.force : (spec.control === CONSTANTS.CONTROL_FORCE);
  const nonZero = spec.control === CONSTANTS.CONTROL_NONZERO;
  const onchange = typeof spec.onchange === 'function' ? spec.onchange : null;
  let currentRawVal = spec.current !== undefined ? spec.current : undefined;
  let currentFormatted = (spec.current !== undefined && formatObj) ? formatObj.format(spec.current) : (spec.current !== undefined ? String(spec.current) : undefined);
  let enabled = true;

  return {
    format: function(val) {
      if (!enabled || val === undefined || val === null) return '';
      if (nonZero && Number(val) === 0) return '';
      const formatted = (formatObj ? formatObj.format(val) : String(val));
      const changed = (formatted !== currentFormatted);
      if (!force && !changed) {
        return '';
      }
      currentRawVal = val;
      currentFormatted = formatted;
      if (onchange) {
        onchange();
      }
      return prefix + formatted;
    },
    reset: function() {
      currentRawVal = undefined;
      currentFormatted = undefined;
    },
    getCurrent: function() {
      return currentRawVal;
    },
    isEnabled: function() {
      return enabled;
    },
    enable: function() {
      enabled = true;
    },
    disable: function() {
      enabled = false;
    }
  };
}

function createModalHelper(spec = {}, formatObj) {
  return createOutputVariableHelper(spec, formatObj);
}

/**
 * FusionPostHarness - Complete CAM execution sandbox for Autodesk Fusion 360 post processors.
 */
class FusionPostHarness {
  constructor(options = {}) {
    this.postPath = options.postPath || null;
    this.postCode = options.postCode || null;
    this.outputLines = [];
    this.errors = [];
    this.warnings = [];
    this.wordSeparator = ' ';
    this.vmContext = null;
    this.postScript = null;

    if (this.postPath || this.postCode) {
      this.initContext();
    }
  }

  /**
   * Resets execution output and error buffers.
   */
  reset() {
    this.outputLines = [];
    this.errors = [];
    this.warnings = [];
    if (this.vmContext) {
      this.vmContext.outputLines = this.outputLines;
      this.vmContext.errors = this.errors;
      this.vmContext.warnings = this.warnings;
    }
  }

  /**
   * Loads a .cps post processor file into the harness.
   *
   * @param {string} filePath - Path to .cps file
   */
  loadPost(filePath) {
    const resolved = path.resolve(filePath);
    this.postPath = resolved;
    this.postCode = fs.readFileSync(resolved, 'utf8');
    this.initContext();
  }

  /**
   * Initializes the VM execution sandbox with complete Autodesk CAM globals.
   */
  initContext() {
    this.outputLines = [];
    this.errors = [];
    this.warnings = [];

    const self = this;

    let activeRotation = new Matrix();

    const mockMachineConfig = {
      isReceived: () => true,
      isMultiAxisConfiguration: () => false,
      isHeadConfiguration: () => false,
      isMachineCoordinate: () => true,
      getVendor: () => 'Brother',
      getModel: () => 'Speedio S700X1',
      getDescription: () => 'Brother Speedio C00 CNC',
      getMaximumSpindleSpeed: () => 16000,
      getNumberOfTools: () => 21,
      getDirection: () => new Vector(0, 0, 1),
      getSpindleAxis: () => new Vector(0, 0, 1),
      getRemainingOrientation: (abc, wp) => wp || new Matrix(),
      getOrientation: () => new Matrix(),
      getOptimizedDirection: () => new Vector(0, 0, 1),
      getOptimizedPosition: (pos) => pos || new Vector(0, 0, 0),
      hasHomePositionX: () => false,
      hasHomePositionY: () => false,
      hasRetractPlane: () => false,
      getRetractPlane: () => 0,
      getHomePositionX: () => 0,
      getHomePositionY: () => 0,
      getHomePositionZ: () => 0,
      setHomePositionX: (x) => {},
      setHomePositionY: (y) => {},
      setHomePositionZ: (z) => {},
      setRetractPlane: (z) => {},
      setToolLength: (l) => {},
      setVirtualTooltip: (v) => {},
      enableMachineRewinds: (b) => {},
      setSafeRetractDistance: (d) => {},
      setSafeRetractFeedrate: (f) => {},
      setSafePlungeFeedrate: (f) => {},
      setRewindStockExpansion: (e) => {},
      setMultiAxisFeedrate: () => {},
      getAxisU: () => ({ isEnabled: () => false, getAxis: () => new Vector(0, 0, 0), isTable: () => false, isTCPEnabled: () => false, getCoordinate: () => 0 }),
      getAxisV: () => ({ isEnabled: () => false, getAxis: () => new Vector(0, 0, 0), isTable: () => false, isTCPEnabled: () => false, getCoordinate: () => 1 }),
      getAxisW: () => ({ isEnabled: () => false, getAxis: () => new Vector(0, 0, 0), isTable: () => false, isTCPEnabled: () => false, getCoordinate: () => 2 }),
      getAxisX: () => ({ isEnabled: () => true, getAxis: () => new Vector(1, 0, 0), isTable: () => true, getCoordinate: () => 0, getRange: () => ({ isNonRange: () => true, minimum: -500, maximum: 500 }) }),
      getAxisY: () => ({ isEnabled: () => true, getAxis: () => new Vector(0, 1, 0), isTable: () => true, getCoordinate: () => 1, getRange: () => ({ isNonRange: () => true, minimum: -400, maximum: 400 }) }),
      getAxisZ: () => ({ isEnabled: () => true, getAxis: () => new Vector(0, 0, 1), isTable: () => false, getCoordinate: () => 2, getRange: () => ({ isNonRange: () => true, minimum: 0, maximum: 480 }) }),
      getMultiAxisFeedrateMode: () => 1,
      getMultiAxisFeedrateInverseTimeUnits: () => 1,
      getMultiAxisFeedrateDPMType: () => 1,
      getMultiAxisFeedrateMaximum: () => 10000,
      getMultiAxisFeedrateOutputTolerance: () => 0.01,
      getMultiAxisFeedrateBpwRatio: () => 1,
      performRewinds: () => false,
      getSafeRetractDistance: () => 0,
      getSafePlungeFeedrate: () => 1000,
      getSafeRetractFeedrate: () => 5000
    };

    const dummyPrevSection = {
      getId: () => -1,
      tool: null,
      getTool: () => null,
      isMultiAxis: () => false,
      isOptional: () => false,
      isOptimizedForMachine: () => false,
      workPlane: new Matrix(),
      wcs: 'G54',
      getABCByPreference: () => new Vector(0, 0, 0),
      getInitialToolAxisABC: () => new Vector(0, 0, 0),
      getGlobalInitialToolAxis: () => new Vector(0, 0, 1),
      getOptimizedTCPMode: () => 0,
      optimize3DPositionsByMachine: () => {},
      getParameter: () => undefined,
      hasParameter: () => false,
      getProperty: () => undefined
    };

    let currentPosition = new Vector(0, 0, 0);
    let currentDirection = new Vector(0, 0, 1);
    let currentABC = new Vector(0, 0, 0);

    const sandbox = {
      // Base JavaScript & Node
      console,
      Math,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Date,
      RegExp,
      Error,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,

      // State references
      outputLines: this.outputLines,
      errors: this.errors,
      warnings: this.warnings,

      // Constants & Engine Properties
      ...CONSTANTS,
      unit: CONSTANTS.MM,
      highFeedMapping: CONSTANTS.HIGH_FEED_NO_MAPPING,
      highFeedrate: 5000,
      spatial: function(val, u) { return val; },
      radiusCompensation: CONSTANTS.RADIUS_COMPENSATION_OFF,
      revision: 50328,
      supportedFeatures: 0,
      setCodePage: function(cp) {},
      activateAutoPolarMode: function() {},
      optimizeMachineAngles2: function() {},
      receivedMachineConfiguration: false,
      formatComment: function(c) { return String(c).replace(/[()]/g, ''); },
      getSimulationStreamPath: function() { return ''; },
      filterText: function(text, permittedChars) {
        if (!text) return '';
        if (!permittedChars) return String(text);
        let result = '';
        const str = String(text);
        for (let i = 0; i < str.length; i++) {
          if (permittedChars.includes(str[i])) {
            result += str[i];
          }
        }
        return result;
      },

      // Simulation Object
      simulation: {
        setTWPModeOff: () => {},
        setTCPModeOff: () => {},
        setTCPModeOn: () => {},
        setTWPModeAlignToCurrentPose: () => {},
        setTWPModeByEulerAngles: () => {},
        retractAlongToolAxisToLimit: () => {},
        setTargetX: () => {},
        setTargetY: () => {},
        setTargetZ: () => {},
        setTargetA: () => {},
        setTargetB: () => {},
        setTargetC: () => {},
        setMotionToLinear: () => {},
        setFeedrate: () => {},
        setMotionToRapid: () => {},
        moveToTargetInMachineCoords: () => {},
        moveToTargetInWorkCoords: () => {},
        performToolChangeCycle: () => {}
      },

      // Property & Global Parameter accessors
      getProperty: function(name, defaultVal) {
        if (sandbox.properties && sandbox.properties[name] !== undefined) {
          const prop = sandbox.properties[name];
          if (prop !== null && typeof prop === 'object' && 'value' in prop) {
            return prop.value;
          }
          return prop;
        }
        return defaultVal;
      },
      setProperty: function(name, val) {
        if (!sandbox.properties) sandbox.properties = {};
        if (sandbox.properties[name] !== null && typeof sandbox.properties[name] === 'object' && 'value' in sandbox.properties[name]) {
          sandbox.properties[name].value = val;
        } else {
          sandbox.properties[name] = val;
        }
      },
      hasGlobalParameter: function(name) {
        return sandbox.globalParameters && sandbox.globalParameters[name] !== undefined;
      },
      getGlobalParameter: function(name, defaultVal = '') {
        if (sandbox.globalParameters && sandbox.globalParameters[name] !== undefined) {
          return sandbox.globalParameters[name];
        }
        return defaultVal;
      },
      setGlobalParameter: function(name, val) {
        if (!sandbox.globalParameters) sandbox.globalParameters = {};
        sandbox.globalParameters[name] = val;
      },

      getParameter: function(name, defaultVal) {
        if (sandbox.currentSection && typeof sandbox.currentSection.getParameter === 'function') {
          const val = sandbox.currentSection.getParameter(name, defaultVal);
          if (val !== undefined && val !== null) return val;
        }
        if (name === 'part-upper-x' || name === 'part-lower-x' || name === 'part-upper-y' || name === 'part-lower-y') {
          return 0;
        }
        return defaultVal;
      },
      hasParameter: function(name) {
        if (sandbox.currentSection && typeof sandbox.currentSection.hasParameter === 'function') {
          return sandbox.currentSection.hasParameter(name);
        }
        return false;
      },

      // Kinematics & Machine Configuration
      createAxis: function(spec) {
        const axVec = Array.isArray(spec.axis) ? new Vector(spec.axis[0], spec.axis[1], spec.axis[2]) : (spec.axis || new Vector(1, 0, 0));
        return {
          coordinate: spec.coordinate || 0,
          table: !!spec.table,
          axis: axVec,
          range: spec.range || [-360, 360],
          preference: spec.preference || 0,
          tcp: !!spec.tcp,
          cyclic: !!spec.cyclic,
          isEnabled: () => true,
          getAxis: () => axVec,
          isTable: () => !!spec.table,
          isTCPEnabled: () => !!spec.tcp,
          getCoordinate: () => spec.coordinate || 0
        };
      },
      MachineConfiguration: function(...axes) {
        this.axes = axes;
        Object.assign(this, mockMachineConfig);
        this.isMultiAxisConfiguration = () => axes.length > 0;
        const disabledAxis = (c) => ({ isEnabled: () => false, getAxis: () => new Vector(0, 0, 0), isTable: () => false, isTCPEnabled: () => false, getCoordinate: () => c });
        this.getAxisU = () => axes[0] || disabledAxis(0);
        this.getAxisV = () => axes[1] || disabledAxis(1);
        this.getAxisW = () => axes[2] || disabledAxis(2);
      },
      setMachineConfiguration: function(config) {
        sandbox.machineConfiguration = config;
      },

      // Geometry & Math Classes
      Vector: function(x, y, z) { return new Vector(x, y, z); },
      Matrix: function(v1, v2, v3) { return new Matrix(v1, v2, v3); },
      toPreciseUnit: function(val, u) { return u === CONSTANTS.IN ? val / 25.4 : val; },
      toUnit: function(val, u) { return u === CONSTANTS.IN ? val / 25.4 : val; },
      toRad: function(deg) { return (deg * Math.PI) / 180; },
      toDeg: function(rad) { return (rad * 180) / Math.PI; },
      clamp: function(min, val, max) { return Math.max(min, Math.min(val, max)); },

      // Formatting
      createFormat: createFormatHelper,
      createOutputVariable: createOutputVariableHelper,
      createReferenceVariable: createOutputVariableHelper,
      createModal: createModalHelper,

      // Output Emitters
      formatWords: function(...args) {
        const flat = flattenArgs(args);
        const words = [];
        for (const arg of flat) {
          if (arg !== undefined && arg !== null && String(arg).trim() !== '') {
            words.push(String(arg));
          }
        }
        return words.join(self.wordSeparator);
      },
      writeWords: function(...args) {
        const text = sandbox.formatWords(...args);
        if (text.length > 0) {
          self.outputLines.push(text);
        }
      },
      writeWords2: function(...args) {
        sandbox.writeWords(...args);
      },
      writeln: function(text) {
        self.outputLines.push(String(text));
      },
      writeComment: function(text) {
        self.outputLines.push(`(${String(text)})`);
      },
      writeRawBlock: function(text) {
        self.outputLines.push(String(text));
      },
      setWordSeparator: function(sep) {
        self.wordSeparator = sep;
      },
      getWordSeparator: function() {
        return self.wordSeparator;
      },
      setAllowedCircularPlanes: function(mask) {},
      writeSetupNotes: function() {},
      writeSectionNotes: function() {},

      // Diagnostics
      validate: function(cond, msg) {
        if (!cond) {
          const err = new Error(msg || 'Validation failed');
          self.errors.push(err.message);
          throw err;
        }
      },
      conditional: function(cond, val, falseVal = '') {
        return cond ? val : falseVal;
      },
      localize: function(str) {
        return String(str);
      },
      subst: function(str, ...args) {
        let res = String(str);
        for (let i = 0; i < args.length; i++) {
          res = res.replace(new RegExp(`%${i + 1}`, 'g'), String(args[i]));
        }
        return res;
      },
      error: function(msg) {
        self.errors.push(String(msg));
      },
      warning: function(msg) {
        self.warnings.push(String(msg));
      },
      warningOnce: function(msg, id) {
        self.warnings.push(String(msg));
      },
      getToolTypeName: function(typeId) {
        const names = {
          [CONSTANTS.TOOL_MILLING_END_FLAT]: 'flat end mill',
          [CONSTANTS.TOOL_MILLING_END_BALL]: 'ball end mill',
          [CONSTANTS.TOOL_MILLING_END_BULLNOSE]: 'bullnose end mill',
          [CONSTANTS.TOOL_MILLING_CHAMFER]: 'chamfer mill',
          [CONSTANTS.TOOL_MILLING_FACE]: 'face mill',
          [CONSTANTS.TOOL_MILLING_SLOT]: 'slot mill',
          [CONSTANTS.TOOL_MILLING_RADIUS]: 'corner rounding mill',
          [CONSTANTS.TOOL_MILLING_DOVETAIL]: 'dovetail mill',
          [CONSTANTS.TOOL_MILLING_TAPERED]: 'tapered mill',
          [CONSTANTS.TOOL_MILLING_LOLLIPOP]: 'lollipop mill',
          [CONSTANTS.TOOL_DRILL]: 'drill',
          [CONSTANTS.TOOL_DRILL_CENTER]: 'center drill',
          [CONSTANTS.TOOL_DRILL_SPOT]: 'spot drill',
          [CONSTANTS.TOOL_DRILL_BLOCK]: 'block drill',
          [CONSTANTS.TOOL_COUNTER_BORE]: 'counterbore',
          [CONSTANTS.TOOL_COUNTER_SINK]: 'countersink',
          [CONSTANTS.TOOL_REAMER]: 'reamer',
          [CONSTANTS.TOOL_TAP_RIGHT_HAND]: 'right hand tap',
          [CONSTANTS.TOOL_TAP_LEFT_HAND]: 'left hand tap',
          [CONSTANTS.TOOL_BORING_BAR]: 'boring bar',
          [CONSTANTS.TOOL_PROBE]: 'probe'
        };
        return names[typeId] || 'tool';
      },

      // Section & Job State
      machineConfiguration: mockMachineConfig,
      programName: 1001,
      programComment: 'TEST CAM JOB',
      spindleSpeed: 10000,
      currentSection: null,
      tool: null,
      tools: [],
      sections: [],
      globalParameters: {},

      // Query APIs
      getNumberOfSections: () => sandbox.sections.length,
      getSection: (idx) => sandbox.sections[idx] || null,
      getCurrentSectionId: () => (sandbox.currentSection ? sandbox.currentSection.getId() : 0),
      isFirstSection: () => {
        if (!sandbox.currentSection) return false;
        return sandbox.currentSection.getId() === 0;
      },
      isLastSection: () => {
        if (!sandbox.currentSection) return false;
        return sandbox.currentSection.getId() === sandbox.sections.length - 1;
      },
      hasNextSection: () => {
        if (!sandbox.currentSection) return false;
        return sandbox.currentSection.getId() < sandbox.sections.length - 1;
      },
      getNextSection: () => {
        if (!sandbox.currentSection) return null;
        return sandbox.sections[sandbox.currentSection.getId() + 1] || null;
      },
      getPreviousSection: () => {
        if (!sandbox.currentSection) return dummyPrevSection;
        const prevId = sandbox.currentSection.getId() - 1;
        return (prevId >= 0 && sandbox.sections[prevId]) ? sandbox.sections[prevId] : dummyPrevSection;
      },
      getToolTable: () => ({
        getNumberOfTools: () => sandbox.tools.length,
        getTool: (i) => sandbox.tools[i] || null
      }),
      getFirstTool: () => sandbox.tools[0] || null,
      getNextTool: (t) => {
        if (typeof t === 'boolean') {
          if (!sandbox.currentSection) return null;
          const nextSec = sandbox.getNextSection();
          return nextSec ? nextSec.getTool() : (t ? sandbox.getFirstTool() : null);
        }
        const idx = sandbox.tools.findIndex(x => x.number === (t && t.number !== undefined ? t.number : t));
        return idx >= 0 && idx < sandbox.tools.length - 1 ? sandbox.tools[idx + 1] : null;
      },

      // Section State Queries
      isProbeOperation: (sec) => {
        const s = sec || sandbox.currentSection;
        if (!s) return false;
        if (s.isInspectionOperation || s.strategy === 'inspectSurface') return false;
        const t = typeof s.getTool === 'function' ? s.getTool() : s.tool;
        return s.strategy === 'probe' || s.strategy === 'probe_wcs' || s.strategy === 'probe_geometry' || s.isProbeOperation === true || (t && t.type === CONSTANTS.TOOL_PROBE);
      },
      isInspectionOperation: (sec) => {
        const s = sec || sandbox.currentSection;
        if (!s) return false;
        return s.isInspectionOperation === true || s.strategy === 'inspectSurface';
      },
      isTappingCycle: (sec) => {
        const s = sec || sandbox.currentSection;
        if (!s) return false;
        const t = typeof s.getTool === 'function' ? s.getTool() : s.tool;
        if (t && (t.type === CONSTANTS.TOOL_TAP_RIGHT_HAND || t.type === CONSTANTS.TOOL_TAP_LEFT_HAND)) return true;
        const ct = s.cycleType || (s.cycle && s.cycle.type) || '';
        return String(ct).includes('tapping');
      },
      isDrillingCycle: (sec) => {
        const s = sec || sandbox.currentSection;
        if (!s) return false;
        if (sandbox.isProbeOperation(s) || sandbox.isInspectionOperation(s)) return false;
        return s.strategy === 'drill' || !!s.cycle;
      },
      isFirstCyclePoint: () => true,
      repositionToCycleClearance: (cycle, x, y, z) => {},
      expandCyclePoint: (x, y, z) => {},
      cycleExpanded: false,
      is3D: () => {
        if (!sandbox.sections || sandbox.sections.length === 0) return true;
        return sandbox.sections.every(s => !s.isMultiAxis() && Vector.diff(s.workPlane.forward, new Vector(0, 0, 1)).length < 1e-4);
      },
      isToolChangeNeeded: (curr, prev) => {
        if (!prev) return true;
        return curr.tool.number !== prev.tool.number;
      },
      isNewWorkOffset: (sec) => {
        const s = sec || sandbox.currentSection;
        if (!s || sandbox.isFirstSection()) return true;
        const prev = sandbox.getPreviousSection();
        return !prev || s.workOffset !== prev.workOffset;
      },
      isNewWorkPlane: (sec) => {
        const s = sec || sandbox.currentSection;
        if (!s || sandbox.isFirstSection()) return true;
        const prev = sandbox.getPreviousSection();
        if (!prev) return true;
        return Vector.diff(s.workPlane.forward, prev.workPlane.forward).length > 1e-4;
      },
      isPolarModeActive: () => false,
      isSameDirection: (a, b) => {
        if (!a || !b) return false;
        return Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5 && Math.abs(a.z - b.z) < 1e-5;
      },
      getCurrentDirection: () => currentDirection,
      setCurrentDirection: (d) => { if (d) currentDirection = new Vector(d); },
      getCurrentABC: () => currentABC,
      setCurrentABC: (abc) => { if (abc) currentABC = new Vector(abc); },
      getRotation: () => activeRotation,
      setRotation: (r) => {
        if (r) activeRotation = r;
      },
      cancelTransformation: () => {},
      getFramePosition: (p) => p ? new Vector(p) : new Vector(0, 0, 0),
      getCurrentPosition: () => currentPosition,
      setCurrentPosition: (p) => { if (p) currentPosition = new Vector(p); },
      getForwardDirection: (sec) => (sec && sec.workPlane ? sec.workPlane.forward : new Vector(0, 0, 1)),
      getWorkOffset: () => (sandbox.currentSection ? sandbox.currentSection.workOffset : 1),
      isSpeedValid: () => true,
      isRadiusCompensationActive: () => false,
      getAngularSpeed: () => 0,
      getCycle: () => null,
      getFeed: () => (sandbox.currentSection ? sandbox.currentSection.feedrate : 1000),
      getCurrentFeedrate: () => (sandbox.currentSection ? sandbox.currentSection.feedrate : 1000),
      getCircularSweep: () => 0,
      getCircularRadius: () => 0,
      getCircularPlane: () => CONSTANTS.PLANE_XY,
      isFullCircle: () => false,
      isHelical: () => false,
      isSpiral: () => false,
      getHelicalPitch: () => 0,
      getArcPosition: () => new Vector(0, 0, 0),
      getNextRecord: () => ({ isMotion: () => false }),

      // Properties object defined by CPS
      properties: {}
    };

    // Vector & Matrix static bindings
    sandbox.Vector.diff = Vector.diff;
    sandbox.Vector.dot = Vector.dot;
    sandbox.Vector.cross = Vector.cross;
    sandbox.Matrix.diff = Matrix.diff;

    this.vmContext = vm.createContext(sandbox);

    // Compile post processor source
    if (this.postCode) {
      this.postScript = new vm.Script(this.postCode, {
        filename: this.postPath || 'post.cps'
      });
      this.postScript.runInContext(this.vmContext);
    }
  }

  /**
   * Helper to create a standardized mock CAM Tool structure.
   */
  createMockTool(toolData = {}) {
    const num = toolData.number || 1;
    return {
      number: num,
      getToolId: () => toolData.toolId || num,
      diameter: toolData.diameter !== undefined ? toolData.diameter : 10.0,
      cornerRadius: toolData.cornerRadius !== undefined ? toolData.cornerRadius : 0,
      lengthOffset: toolData.lengthOffset !== undefined ? toolData.lengthOffset : num,
      diameterOffset: toolData.diameterOffset !== undefined ? toolData.diameterOffset : num,
      type: toolData.type || CONSTANTS.TOOL_MILLING_END_FLAT,
      description: toolData.description || `Tool ${num}`,
      comment: toolData.comment || '',
      flutes: toolData.flutes || 4,
      numberOfFlutes: toolData.numberOfFlutes || toolData.flutes || 4,
      spindleRPM: toolData.spindleRPM || 10000,
      rampingSpindleRPM: toolData.rampingSpindleRPM || toolData.spindleRPM || 10000,
      clockwise: toolData.clockwise !== undefined ? toolData.clockwise : true,
      manualToolChange: !!toolData.manualToolChange,
      coolant: toolData.coolant !== undefined ? toolData.coolant : CONSTANTS.COOLANT_FLOOD,
      threadPitch: toolData.threadPitch || 1.0,
      taperAngle: toolData.taperAngle || 0,
      fluteLength: toolData.fluteLength || 20,
      bodyLength: toolData.bodyLength || 40,
      holderLength: toolData.holderLength || 20,
      breakControl: !!toolData.breakControl,
      getTappingFeedrate: () => (toolData.threadPitch ? (toolData.spindleRPM || 1000) * toolData.threadPitch : 1000),
      isTurningTool: () => false,
      isProbeTool: () => toolData.type === CONSTANTS.TOOL_PROBE,
      isDrill: () => toolData.type === CONSTANTS.TOOL_DRILL || toolData.type === CONSTANTS.TOOL_DRILL_SPOT,
      isMillingTool: () => toolData.type <= CONSTANTS.TOOL_MILLING_LOLLIPOP
    };
  }

  /**
   * Helper to create a standardized mock CAM Section structure.
   */
  createMockSection(sectionData = {}, sectionId = 0) {
    const toolObj = sectionData.tool || this.createMockTool({
      number: sectionData.toolNumber || 1,
      diameter: sectionData.toolDiameter || 10.0,
      type: sectionData.toolType || CONSTANTS.TOOL_MILLING_END_FLAT,
      description: sectionData.toolDescription || `Tool ${sectionData.toolNumber || 1}`
    });

    const initialPos = sectionData.initialPosition || new Vector(0, 0, 25);
    const finalPos = sectionData.finalPosition || new Vector(0, 0, 25);
    const wp = sectionData.workPlane || new Matrix();
    if (!wp.forward) {
      wp.forward = new Vector(0, 0, 1);
    }

    return {
      getId: () => sectionId,
      tool: toolObj,
      getTool: () => toolObj,
      spindleSpeed: sectionData.spindleSpeed || 10000,
      feedrate: sectionData.feedrate || 1000,
      workOffset: sectionData.workOffset !== undefined ? sectionData.workOffset : 1,
      workPlane: wp,
      strategy: sectionData.strategy || 'face',
      operationComment: sectionData.operationComment || `Operation ${sectionId + 1}`,
      cycle: sectionData.cycle || null,
      wcs: sectionData.wcs || 'G54',
      isOptional: () => !!sectionData.isOptional,
      isMultiAxis: () => !!sectionData.isMultiAxis,
      isOptimizedForMachine: () => !!sectionData.isOptimizedForMachine,
      getPolarMode: () => 0,
      getInternalPatternId: () => 0,
      getPatternId: () => 0,
      isPatterned: () => false,
      probeWorkOffset: 0,
      hasAnyCycle: () => false,
      getMovements: () => 0,
      workOrigin: new Vector(0, 0, 0),
      getModelOrigin: () => new Vector(0, 0, 0),
      getModelPlane: () => wp,
      getGlobalInitialToolAxis: () => new Vector(0, 0, 1),
      getInitialToolAxisABC: () => new Vector(0, 0, 0),
      getOptimizedTCPMode: () => 0,
      getABCByPreference: () => new Vector(0, 0, 0),
      optimize3DPositionsByMachine: () => {},
      isConnectionSection: () => false,
      getType: () => CONSTANTS.TYPE_MILLING,
      getProperty: (n, def) => def,
      hasParameter: (n) => true,
      getParameter: (n, def) => {
        if (n === 'operation-comment') return sectionData.operationComment || `Operation ${sectionId + 1}`;
        return def;
      },
      getGlobalZRange: () => {
        const r = {
          minimum: -10,
          maximum: 50,
          getMinimum: function() { return this.minimum; },
          getMaximum: function() { return this.maximum; },
          expandTo: function(z) {
            if (z < this.minimum) this.minimum = z;
            if (z > this.maximum) this.maximum = z;
          },
          expandRange: function(other) {
            if (other) {
              const omin = typeof other.getMinimum === 'function' ? other.getMinimum() : other.minimum;
              const omax = typeof other.getMaximum === 'function' ? other.getMaximum() : other.maximum;
              if (omin < this.minimum) this.minimum = omin;
              if (omax > this.maximum) this.maximum = omax;
            }
          },
          expandToRange: function(other) {
            this.expandRange(other);
          }
        };
        return r;
      },
      optimizeMachineAnglesByMachine: () => new Vector(0, 0, 0),
      getInitialPosition: () => initialPos,
      getFinalPosition: () => finalPos,
      getGlobalInitialPosition: () => initialPos,
      getGlobalFinalPosition: () => finalPos,
      doesToolpathFitWithin: () => true
    };
  }

  /**
   * Executes a simulated post processor job.
   *
   * @param {object} jobSpec - Job parameters
   * @param {number|string} [jobSpec.programName=1001] - G-code program number / name
   * @param {string} [jobSpec.programComment='CAM TEST'] - Program header comment
   * @param {object} [jobSpec.properties={}] - Post processor property overrides
   * @param {Array<object>} [jobSpec.tools=[]] - Tool definitions
   * @param {Array<object>} [jobSpec.sections=[]] - CAM section / operation definitions
   * @param {Array<number>} [jobSpec.commands=[]] - Commands to fire between sections
   * @returns {{ output: string, blocks: string[], errors: string[], warnings: string[] }}
   */
  execute(jobSpec = {}) {
    if (!this.vmContext) {
      throw new Error('Post processor not loaded. Call loadPost(filePath) first.');
    }

    this.reset();

    const ctx = this.vmContext;

    // Apply job-level overrides
    if (jobSpec.programName !== undefined) {
      ctx.programName = jobSpec.programName;
    }
    if (jobSpec.programComment !== undefined) {
      ctx.programComment = jobSpec.programComment;
    }

    // Merge properties into the CPS properties table
    if (jobSpec.properties) {
      for (const [key, val] of Object.entries(jobSpec.properties)) {
        if (ctx.properties[key] !== null && typeof ctx.properties[key] === 'object' && 'value' in ctx.properties[key]) {
          ctx.properties[key].value = val;
        } else {
          ctx.properties[key] = val;
        }
      }
    }

    // Build tools table
    const rawTools = jobSpec.tools || [];
    let toolList = rawTools.map(t => this.createMockTool(t));
    if (toolList.length === 0) {
      toolList.push(this.createMockTool({ number: 1, diameter: 10.0 }));
    }
    ctx.tools = toolList;

    // Build sections table
    const rawSections = jobSpec.sections || [{}];
    const sectionList = rawSections.map((s, idx) => {
      if (!s.tool && s.toolNumber) {
        const found = toolList.find(t => t.number === s.toolNumber);
        if (found) s.tool = found;
      }
      return this.createMockSection(s, idx);
    });
    ctx.sections = sectionList;

    try {
      // 1. Invoke onOpen()
      if (typeof ctx.onOpen === 'function') {
        ctx.onOpen();
      }

      // 2. Iterate sections
      for (let i = 0; i < sectionList.length; i++) {
        const sec = sectionList[i];
        ctx.currentSection = sec;
        ctx.tool = sec.tool;
        ctx.spindleSpeed = sec.spindleSpeed;

        if (typeof ctx.onSection === 'function') {
          ctx.onSection();
        }

        // Optional inter-section commands
        if (Array.isArray(jobSpec.commands)) {
          for (const cmd of jobSpec.commands) {
            if (typeof ctx.onCommand === 'function') {
              ctx.onCommand(cmd);
            }
          }
        }

        if (typeof ctx.onSectionEnd === 'function') {
          ctx.onSectionEnd();
        }
      }

      // 3. Invoke onClose()
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

  /**
   * Returns generated output as a single string joined by CRLF.
   */
  getOutput() {
    return this.outputLines.join('\r\n');
  }

  /**
   * Returns array of generated output lines.
   */
  getBlocks() {
    return [...this.outputLines];
  }

  /**
   * Returns list of recorded error messages.
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Returns list of recorded warning messages.
   */
  getWarnings() {
    return [...this.warnings];
  }
}

module.exports = {
  FusionPostHarness,
  CONSTANTS,
  Vector,
  Matrix
};

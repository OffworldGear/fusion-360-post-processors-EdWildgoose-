/**
 * macro_validator.js - Fanuc Macro B & Brother Speedio C00 Syntax & Invariant Validator
 *
 * Validates G-code macro subprograms (.NC) against Brother CNC controller constraints:
 * - Line length <= 80 characters
 * - Balanced square brackets [...] for math/conditions
 * - Single-level parentheses (...) for comments (no nested parentheses)
 * - Unique sequence numbers (N labels)
 * - Resolution of all static GOTO target labels
 * - Variable range enforcement (#1-#33, #100-#199, #500-#999, Brother 10000-13099 tool registers)
 * - Maximum 20 characters in #3000 alarm messages
 * - Zero-comp invariants: #[13000+T] must never be assigned nominal diameter/radius (>0)
 * - CRLF line ending verification
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Valid variable number check for Brother Speedio C00 / Fanuc Macro B.
 *
 * @param {number} num - The variable number after '#'
 * @param {boolean} isAssignment - Whether this variable is being assigned to
 * @returns {{ valid: boolean, reason?: string }}
 */
function isValidVariableNumber(num, isAssignment = false) {
  if (num === 0) {
    if (isAssignment) {
      return { valid: false, reason: '#0 is the null/vacant variable and cannot be written to' };
    }
    return { valid: true }; // Reading #0 is valid (e.g. IF [#1 EQ #0])
  }

  // Local variables: #1 to #33
  if (num >= 1 && num <= 33) {
    return { valid: true };
  }

  // Common volatile variables: #100 to #199
  if (num >= 100 && num <= 199) {
    return { valid: true };
  }

  // Common non-volatile (retentive) variables: #500 to #999
  if (num >= 500 && num <= 999) {
    return { valid: true };
  }

  // System I/O variables: #1000-#1035, #1100-#1135
  if ((num >= 1000 && num <= 1035) || (num >= 1100 && num <= 1135)) {
    return { valid: true };
  }

  // System alarms, timers, control: #3000 to #3006
  if (num >= 3000 && num <= 3006) {
    return { valid: true };
  }

  // Spindle tool / active tool register: #3700
  if (num === 3700) {
    return { valid: true };
  }

  // Modal information: #4000 to #4130 (e.g. #4006=metric/inch, #4109=feedrate)
  if (num >= 4000 && num <= 4130) {
    return { valid: true };
  }

  // Machine coordinates and positions: #5021-#5028, #5041-#5048, #5061-#5068
  if ((num >= 5021 && num <= 5028) || (num >= 5041 && num <= 5048) || (num >= 5061 && num <= 5068)) {
    return { valid: true };
  }

  // Brother Speedio Tool Table Registers:
  // 10001-10099: Tool length wear
  // 11001-11099: Tool length geometry
  // 12001-12099: Cutter radius wear
  // 13001-13099: Cutter radius geometry
  if ((num >= 10001 && num <= 10099) ||
      (num >= 11001 && num <= 11099) ||
      (num >= 12001 && num <= 12099) ||
      (num >= 13001 && num <= 13099)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Variable #${num} is outside valid Fanuc Macro B / Brother C00 variable ranges`
  };
}

/**
 * Validates a macro string or file content.
 *
 * @param {string} macroText - Raw macro content
 * @param {object} [options={}] - Validation options
 * @param {boolean} [options.checkCRLF=true] - Verify CRLF line endings
 * @param {boolean} [options.maxLineLength=80] - Maximum allowed line length
 * @param {boolean} [options.enforceZeroComp=false] - Enforce zero-comp invariant (#[13000+T] === 0)
 * @param {boolean} [options.requirePreAlarmCleanup=false] - Enforce cleanup before #3000 alarms
 * @param {string} [options.filename='macro.NC'] - Filename for error reporting
 * @returns {{ valid: boolean, errors: Array<{ line: number, message: string, rule: string }>, warnings: Array<{ line: number, message: string, rule: string }>, stats: object }}
 */
function validateMacroString(macroText, options = {}) {
  const {
    checkCRLF = true,
    maxLineLength = 80,
    enforceZeroComp = false,
    requirePreAlarmCleanup = false,
    filename = 'macro.NC'
  } = options;

  const errors = [];
  const warnings = [];

  const labels = new Map(); // labelNumber -> lineNumber
  const gotos = [];         // Array<{ line: number, target: number|string, isDynamic: boolean }>
  const variablesUsed = new Set();

  if (typeof macroText !== 'string') {
    return {
      valid: false,
      errors: [{ line: 0, message: 'Macro text must be a string', rule: 'TYPE_ERROR' }],
      warnings: [],
      stats: { lineCount: 0, labels: [], gotos: [], variablesUsed: [] }
    };
  }

  // Check CRLF across the entire file if requested
  if (checkCRLF) {
    // If the file contains \n not preceded by \r
    if (/[^\r]\n/.test(macroText) || (macroText.startsWith('\n'))) {
      errors.push({
        line: 1,
        message: 'File contains bare LF without CR. Brother Speedio macros require CRLF (\\r\\n) line endings.',
        rule: 'CRLF_REQUIRED'
      });
    }
  }

  // Split lines by \r\n or \n
  const rawLines = macroText.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const rawLine = rawLines[lineIdx];

    // If last line is empty and at EOF, allow it
    if (lineIdx === rawLines.length - 1 && rawLine.trim() === '') {
      continue;
    }

    // 1. Line Length Check (exclude trailing CRLF)
    if (rawLine.length > maxLineLength) {
      errors.push({
        line: lineNum,
        message: `Line exceeds maximum length of ${maxLineLength} characters (${rawLine.length} chars): "${rawLine.substring(0, 40)}..."`,
        rule: 'MAX_LINE_LENGTH'
      });
    }

    // 2. Lexical Scan: Separate Comments from Code and Check Parentheses
    let codePart = '';
    let inComment = false;
    let commentBuffer = '';
    let parenDepth = 0;

    for (let cIdx = 0; cIdx < rawLine.length; cIdx++) {
      const char = rawLine[cIdx];

      if (char === '(') {
        if (inComment) {
          errors.push({
            line: lineNum,
            message: 'Nested parentheses inside comments are illegal in Fanuc Macro B.',
            rule: 'NESTED_PARENTHESES'
          });
        } else {
          inComment = true;
          commentBuffer = '';
          parenDepth++;
        }
      } else if (char === ')') {
        if (!inComment) {
          errors.push({
            line: lineNum,
            message: 'Unopened closing parenthesis ")".',
            rule: 'UNOPENED_PARENTHESIS'
          });
        } else {
          inComment = false;
          parenDepth--;
          // Check if this was an alarm message
          // e.g. #3000=101(INVALID TOOL NUMBER)
          const codeBefore = codePart.trim();
          if (/#3000\s*=\s*\d+$/i.test(codeBefore)) {
            if (commentBuffer.length > 20) {
              errors.push({
                line: lineNum,
                message: `#3000 alarm message exceeds Brother 20-character limit (${commentBuffer.length} chars): "${commentBuffer}"`,
                rule: 'ALARM_MSG_LENGTH'
              });
            }
          }
        }
      } else {
        if (inComment) {
          commentBuffer += char;
        } else {
          codePart += char;
        }
      }
    }

    if (inComment || parenDepth > 0) {
      errors.push({
        line: lineNum,
        message: 'Unclosed comment parenthesis "(" at end of line.',
        rule: 'UNCLOSED_PARENTHESIS'
      });
    }

    // 3. Balanced Square Brackets Check [...] in codePart
    let bracketDepth = 0;
    for (let i = 0; i < codePart.length; i++) {
      const char = codePart[i];
      if (char === '[') {
        bracketDepth++;
      } else if (char === ']') {
        bracketDepth--;
        if (bracketDepth < 0) {
          errors.push({
            line: lineNum,
            message: 'Unexpected closing bracket "]" without matching opening bracket.',
            rule: 'UNMATCHED_CLOSING_BRACKET'
          });
          bracketDepth = 0;
        }
      }
    }

    if (bracketDepth > 0) {
      errors.push({
        line: lineNum,
        message: `Unclosed opening bracket "[" at end of line (${bracketDepth} unclosed).`,
        rule: 'UNCLOSED_BRACKET'
      });
    }

    const trimmedCode = codePart.trim();
    if (trimmedCode.length === 0) {
      continue;
    }

    // 4. Label (N<number>) Detection & Uniqueness
    // Fanuc block labels appear as N10, N9101, etc.
    const labelMatch = trimmedCode.match(/^N(\d+)/i);
    if (labelMatch) {
      const labelNum = parseInt(labelMatch[1], 10);
      if (labels.has(labelNum)) {
        errors.push({
          line: lineNum,
          message: `Duplicate block label N${labelNum} previously defined on line ${labels.get(labelNum)}.`,
          rule: 'DUPLICATE_LABEL'
        });
      } else {
        labels.set(labelNum, lineNum);
      }
    }

    // 5. GOTO Statement Detection
    // Matches GOTO 10, GOTO10, GOTO[#100], etc.
    const gotoRegex = /GOTO\s*(\[\s*[^\]]+\s*\]|\d+)/gi;
    let gMatch;
    while ((gMatch = gotoRegex.exec(trimmedCode)) !== null) {
      const targetStr = gMatch[1].trim();
      if (targetStr.startsWith('[')) {
        gotos.push({
          line: lineNum,
          target: targetStr,
          isDynamic: true
        });
      } else {
        const targetNum = parseInt(targetStr, 10);
        gotos.push({
          line: lineNum,
          target: targetNum,
          isDynamic: false
        });
      }
    }

    // 6. IF Condition Syntax
    // Fanuc syntax: IF [...] GOTO <target>  or IF [...] THEN ...
    if (/\bIF\b/i.test(trimmedCode)) {
      const ifIdx = trimmedCode.search(/\bIF\b/i);
      const afterIf = trimmedCode.substring(ifIdx + 2).trim();
      if (!afterIf.startsWith('[')) {
        errors.push({
          line: lineNum,
          message: 'Malformed IF statement: condition must be enclosed in brackets [...].',
          rule: 'MALFORMED_IF'
        });
      } else {
        // Extract balanced condition brackets
        let condDepth = 0;
        let condEnd = -1;
        for (let j = 0; j < afterIf.length; j++) {
          if (afterIf[j] === '[') {
            condDepth++;
          } else if (afterIf[j] === ']') {
            condDepth--;
            if (condDepth === 0) {
              condEnd = j;
              break;
            }
          }
        }

        if (condEnd === -1) {
          errors.push({
            line: lineNum,
            message: 'Unclosed bracket in IF condition.',
            rule: 'MALFORMED_IF'
          });
        } else {
          const condContent = afterIf.substring(1, condEnd).trim();
          // Check for relational operator: EQ, NE, GT, LT, GE, LE
          if (!/\b(EQ|NE|GT|LT|GE|LE)\b/i.test(condContent)) {
            warnings.push({
              line: lineNum,
              message: `IF condition [${condContent}] has no standard relational operator (EQ, NE, GT, LT, GE, LE).`,
              rule: 'NONSTANDARD_IF_CONDITION'
            });
          }
        }
      }
    }

    // 7. Variable Range Verification
    // Check static variable references #<digits>
    const varRegex = /#(\d+)/g;
    let vMatch;
    while ((vMatch = varRegex.exec(trimmedCode)) !== null) {
      const varNum = parseInt(vMatch[1], 10);
      variablesUsed.add(varNum);

      // Determine if this is an assignment target, e.g. #0 = ... or #100 = ...
      // Check if preceded by start of line or space and followed by =
      const beforeIndex = vMatch.index;
      const afterIndex = varRegex.lastIndex;
      const prefix = trimmedCode.substring(0, beforeIndex).trim();
      const suffix = trimmedCode.substring(afterIndex).trim();
      const isTarget = (prefix === '' || prefix.endsWith(']') || /^[A-Z0-9]+$/i.test(prefix)) && suffix.startsWith('=');

      const check = isValidVariableNumber(varNum, isTarget);
      if (!check.valid) {
        errors.push({
          line: lineNum,
          message: check.reason,
          rule: 'INVALID_VARIABLE_RANGE'
        });
      }
    }

    // Check dynamic register base expressions, e.g. #[10000 + ...] or #[13000 + ...]
    const dynVarRegex = /#\[\s*(\d+)\s*\+/g;
    let dynMatch;
    while ((dynMatch = dynVarRegex.exec(trimmedCode)) !== null) {
      const baseNum = parseInt(dynMatch[1], 10);
      if (![10000, 11000, 12000, 13000].includes(baseNum)) {
        warnings.push({
          line: lineNum,
          message: `Unusual dynamic variable base offset #[${baseNum}+...]. Expected 10000, 11000, 12000, or 13000 for Brother tool registers.`,
          rule: 'UNUSUAL_DYNAMIC_OFFSET'
        });
      }
    }

    // 8. Zero-Comp Invariant Verification
    // Brother Speedio C00 Zero-Comp Rule:
    // #[13000+T] or #13001-#13099 (cutter compensation geometry) must NEVER hold nominal tool radius or diameter (>0).
    // In zero-comp workflow, 13000+T must strictly stay 0. Nominal radius is stored in #115 = [#7 / 2.]
    if (enforceZeroComp) {
      // Check assignments to 13000 series
      const zeroCompAssignMatch = trimmedCode.match(/(?:#130\d\d|#\[\s*13000\s*\+[^\]]+\])\s*=\s*(.+)$/i);
      if (zeroCompAssignMatch) {
        const rhs = zeroCompAssignMatch[1].trim();
        // Check if RHS is 0 or 0. or 0.0 or 0.0000
        const isZero = /^(?:0|0\.|0\.0+)(?:\s*;|\s*$)/.test(rhs);
        if (!isZero) {
          errors.push({
            line: lineNum,
            message: `Zero-comp invariant violation: #[13000+T] cutter radius geometry register must never be assigned a non-zero value ("${rhs}"). Nominal radius must be passed in #115=[#7/2.].`,
            rule: 'ZERO_COMP_VIOLATION'
          });
        }
      }

      // Check nominal radius calculation convention
      if (trimmedCode.includes('#115') && trimmedCode.includes('=')) {
        // e.g. #115 = [#7 / 2.] or #115=[#7/2.0]
        if (!/#115\s*=\s*\[?\s*#7\s*\/\s*2\.?0?\s*\]?/i.test(trimmedCode)) {
          warnings.push({
            line: lineNum,
            message: `Nominal radius assignment to #115 does not follow standard formula [#7 / 2.]: "${trimmedCode}".`,
            rule: 'NONSTANDARD_NOMINAL_RADIUS_FORMULA'
          });
        }
      }
    }
  }

  // 9. GOTO Target Label Resolution Check
  for (const gotoItem of gotos) {
    if (!gotoItem.isDynamic) {
      const targetLabel = gotoItem.target;
      if (!labels.has(targetLabel)) {
        errors.push({
          line: gotoItem.line,
          message: `Target label N${targetLabel} not found for GOTO ${targetLabel}.`,
          rule: 'UNRESOLVED_GOTO_TARGET'
        });
      }
    }
  }

  // 10. Pre-Alarm Cleanup Invariant (O8679 Error Recovery)
  if (requirePreAlarmCleanup) {
    // Check if macro contains #3000 alarm calls and whether tool registers are safely reset before alarm
    const hasAlarm = rawLines.some(l => /#3000\s*=/i.test(l));
    if (hasAlarm) {
      const hasRegisterClear = rawLines.some(l => /#\[\s*13000\s*\+.*\]\s*=\s*0/i.test(l));
      const hasFlagReset = rawLines.some(l => /#580\s*=\s*0/i.test(l));
      if (!hasRegisterClear || !hasFlagReset) {
        warnings.push({
          line: 1,
          message: 'Error recovery / alarm handler macro does not explicitly clear #[13000+T] or reset in-progress flag #580 before alarm invocation.',
          rule: 'MISSING_PRE_ALARM_CLEANUP'
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      lineCount: rawLines.length,
      labels: Array.from(labels.keys()),
      gotos: gotos.map(g => g.target),
      variablesUsed: Array.from(variablesUsed).sort((a, b) => a - b)
    }
  };
}

/**
 * Validates a macro file on disk.
 *
 * @param {string} filePath - Absolute or relative path to the macro file (.NC)
 * @param {object} [options={}] - Validation options
 * @returns {{ valid: boolean, errors: Array<{ line: number, message: string, rule: string }>, warnings: Array<{ line: number, message: string, rule: string }>, stats: object, filePath: string }}
 */
function validateMacroFile(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      errors: [{
        line: 0,
        message: `Macro file does not exist: ${resolvedPath}`,
        rule: 'FILE_NOT_FOUND'
      }],
      warnings: [],
      stats: { lineCount: 0, labels: [], gotos: [], variablesUsed: [] },
      filePath: resolvedPath
    };
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const result = validateMacroString(content, {
      ...options,
      filename: resolvedPath
    });

    return {
      ...result,
      filePath: resolvedPath
    };
  } catch (err) {
    return {
      valid: false,
      errors: [{
        line: 0,
        message: `Failed to read macro file ${resolvedPath}: ${err.message}`,
        rule: 'FILE_READ_ERROR'
      }],
      warnings: [],
      stats: { lineCount: 0, labels: [], gotos: [], variablesUsed: [] },
      filePath: resolvedPath
    };
  }
}

module.exports = {
  validateMacroFile,
  validateMacroString,
  isValidVariableNumber
};

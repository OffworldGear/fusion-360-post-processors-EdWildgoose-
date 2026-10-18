/**
 * cps_compiler.js - Syntax validation for Autodesk Fusion 360 CAM Post Processors (.cps)
 *
 * Compiles JavaScript source using Node.js vm.Script to detect syntax errors,
 * unclosed tokens, invalid grammar, and malformed expressions before execution.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * Extracts line and column numbers from a V8 SyntaxError.
 *
 * @param {Error} err - The caught syntax error
 * @param {string} filename - The file name passed to vm.Script
 * @returns {{ line: number|null, column: number|null }}
 */
function extractErrorLocation(err, filename) {
  let line = null;
  let column = null;

  if (err && typeof err.stack === 'string') {
    const lines = err.stack.split(/\r?\n/);
    if (lines.length >= 1) {
      // Line 0 typically: "path/to/file.cps:42" or "filename:42:15"
      const match = lines[0].match(/:(\d+)(?::(\d+))?$/);
      if (match) {
        line = parseInt(match[1], 10);
        if (match[2]) {
          column = parseInt(match[2], 10);
        }
      }
    }

    // Line 2 often contains the caret line pointing to the column: "    ^"
    if (column === null && lines.length >= 3) {
      const caretIdx = lines[2].indexOf('^');
      if (caretIdx >= 0) {
        column = caretIdx + 1; // 1-based index
      }
    }
  }

  // Fallback to error properties if available in some Node environments
  if (line === null && typeof err.lineNumber === 'number') {
    line = err.lineNumber;
  }
  if (column === null && typeof err.columnNumber === 'number') {
    column = err.columnNumber;
  }

  return { line, column };
}

/**
 * Validates the JavaScript syntax of a post processor code string.
 *
 * @param {string} code - The JavaScript source code of the post processor
 * @param {string} [filename='post.cps'] - The file name for error tracing
 * @returns {{ valid: boolean, name?: string, message?: string, line?: number, column?: number, stack?: string }}
 */
function validateCpsString(code, filename = 'post.cps') {
  if (typeof code !== 'string') {
    return {
      valid: false,
      name: 'TypeError',
      message: 'Code parameter must be a string',
      line: null,
      column: null
    };
  }

  try {
    // Attempt compilation via V8 vm.Script
    new vm.Script(code, {
      filename,
      displayErrors: true,
      produceCachedData: false
    });

    return {
      valid: true,
      name: null,
      message: null,
      line: null,
      column: null,
      stack: null
    };
  } catch (err) {
    const loc = extractErrorLocation(err, filename);
    return {
      valid: false,
      name: err.name || 'SyntaxError',
      message: err.message || String(err),
      line: loc.line,
      column: loc.column,
      stack: err.stack || null
    };
  }
}

/**
 * Validates the JavaScript syntax of a post processor file on disk.
 *
 * @param {string} filePath - Absolute or relative path to the .cps file
 * @returns {{ valid: boolean, name?: string, message?: string, line?: number, column?: number, stack?: string, filePath: string }}
 */
function validateCpsFile(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      name: 'FileNotFoundError',
      message: `CPS file does not exist: ${resolvedPath}`,
      line: null,
      column: null,
      filePath: resolvedPath
    };
  }

  try {
    const code = fs.readFileSync(resolvedPath, 'utf8');
    const result = validateCpsString(code, resolvedPath);
    return {
      ...result,
      filePath: resolvedPath
    };
  } catch (err) {
    return {
      valid: false,
      name: err.name || 'Error',
      message: `Failed to read file ${resolvedPath}: ${err.message}`,
      line: null,
      column: null,
      filePath: resolvedPath
    };
  }
}

// Export both standard names and alias validateCpsSyntax for compatibility
module.exports = {
  validateCpsSyntax: validateCpsFile,
  validateCpsFile,
  validateCpsString,
  extractErrorLocation
};

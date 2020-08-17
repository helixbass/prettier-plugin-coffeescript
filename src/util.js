'use strict'

const {
  hasNewline,
  skipNewline,
  hasNewlineInRange,
  makeString,
  isPreviousLineEmpty,
} = require('prettier').util

function skip(chars) {
  return (text, index, opts) => {
    const backwards = opts && opts.backwards

    // Allow `skip` functions to be threaded together without having
    // to check for failures (did someone say monads?).
    if (index === false) {
      return false
    }

    const length = text.length
    let cursor = index
    while (cursor >= 0 && cursor < length) {
      const c = text.charAt(cursor)
      if (chars instanceof RegExp) {
        if (!chars.test(c)) {
          return cursor
        }
      } else if (chars.indexOf(c) === -1) {
        return cursor
      }

      backwards ? cursor-- : cursor++
    }

    if (cursor === -1 || cursor === length) {
      // If we reached the beginning or end of the file, return the
      // out-of-bounds cursor. It's up to the caller to handle this
      // correctly. We don't want to indicate `false` though if it
      // actually skipped valid characters.
      return cursor
    }
    return false
  }
}

// const skipWhitespace = skip(/\s/)
const skipSpaces = skip(' \t')
const skipToLineEnd = skip(',; \t')
const skipEverythingButNewLine = skip(/[^\r\n]/)

function skipInlineComment(text, index) {
  if (index === false) {
    return false
  }

  if (
    text.charAt(index) === '#' &&
    text.charAt(index + 1) === '#' &&
    text.charAt(index + 2) === '#' &&
    text.charAt(index + 3) !== '#'
  ) {
    for (let i = index + 4; i < text.length; ++i) {
      if (
        text.charAt(i) === '#' &&
        text.charAt(i + 1) === '#' &&
        text.charAt(i + 2) === '#'
      ) {
        return i + 3
      }
    }
  }
  return index
}

function skipTrailingComment(text, index) {
  if (index === false) {
    return false
  }

  if (text.charAt(index) === '#') {
    return skipEverythingButNewLine(text, index)
  }
  return index
}

function isNextLineEmptyAfterIndex(text, index) {
  let oldIdx = null
  let idx = index
  while (idx !== oldIdx) {
    // We need to skip all the potential trailing inline comments
    oldIdx = idx
    idx = skipToLineEnd(text, idx)
    idx = skipInlineComment(text, idx)
    idx = skipSpaces(text, idx)
  }
  idx = skipTrailingComment(text, idx)
  idx = skipNewline(text, idx)
  return hasNewline(text, idx)
}

function isNextLineEmpty(text, node, locEnd) {
  return isNextLineEmptyAfterIndex(text, locEnd(node))
}

function hasSameStartLine(node, other) {
  return node.loc.start.line === other.loc.start.line
}

function getNextNonSpaceNonCommentCharacterIndexWithStartIndex(text, idx) {
  let oldIdx = null
  let nextIdx = idx
  while (nextIdx !== oldIdx) {
    oldIdx = nextIdx
    nextIdx = skipSpaces(text, nextIdx)
    nextIdx = skipInlineComment(text, nextIdx)
    nextIdx = skipNewline(text, nextIdx)
  }
  return nextIdx
}

function getNextNonSpaceNonCommentCharacterIndex(text, node, locEnd) {
  return getNextNonSpaceNonCommentCharacterIndexWithStartIndex(
    text,
    locEnd(node)
  )
}

function getNextNonSpaceNonCommentCharacter(text, node, locEnd) {
  return text.charAt(
    getNextNonSpaceNonCommentCharacterIndex(text, node, locEnd)
  )
}

function isFunction(node) {
  return (
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  )
}

const getLast = (arr) => arr[arr.length - 1]
const getPenultimate = (arr) => arr[arr.length - 2]

const equalityOperators = {
  '==': true,
  '!=': true,
  '===': true,
  '!==': true,
}
const multiplicativeOperators = {
  '*': true,
  '/': true,
  '%': true,
}
const bitshiftOperators = {
  '>>': true,
  '>>>': true,
  '<<': true,
}

function isBitwiseOperator(operator) {
  return (
    !!bitshiftOperators[operator] ||
    operator === '|' ||
    operator === '^' ||
    operator === '&'
  )
}

function printNumber(rawNumber) {
  return (
    rawNumber
      .toLowerCase()
      // Remove unnecessary plus and zeroes from scientific notation.
      .replace(/^([+-]?[\d.]+e)(?:\+|(-))?0*(\d)/, '$1$2$3')
      // Remove unnecessary scientific notation (1e0).
      .replace(/^([+-]?[\d.]+)e[+-]?0+$/, '$1')
      // Make sure numbers always start with a digit.
      .replace(/^([+-])?\./, '$10.')
      // Remove extraneous trailing decimal zeroes.
      .replace(/(\.\d+?)0+(?=e|$)/, '$1')
      // Remove trailing dot.
      .replace(/\.(?=e|$)/, '')
  )
}

const PRECEDENCE = {}
;[
  ['??'],
  ['||'],
  ['&&'],
  ['|'],
  ['^'],
  ['&'],
  ['===', '!=='],
  ['<', '>', '<=', '>=', 'in', 'instanceof', 'of'],
  ['>>', '<<', '>>>'],
  ['+', '-'],
  ['*', '/', '%'],
  ['**'],
].forEach((tier, i) => {
  tier.forEach((op) => {
    PRECEDENCE[op] = i
  })
})

function getPrecedence(op) {
  return PRECEDENCE[op]
}

function getCanonicalOperator(node) {
  const {operator} = node
  if (operator === '?' && node.type === 'LogicalExpression') {
    return '??'
  }
  return operatorAliasMap[operator] || operator
}

function shouldFlattenJs(parentOp, nodeOp) {
  if (getPrecedence(nodeOp) !== getPrecedence(parentOp)) {
    return false
  }

  // ** is right-associative
  // x ** y ** z --> x ** (y ** z)
  if (parentOp === '**') {
    return false
  }

  // x == y == z --> (x == y) == z
  if (equalityOperators[parentOp] && equalityOperators[nodeOp]) {
    return false
  }

  // x * y % z --> (x * y) % z
  if (
    (nodeOp === '%' && multiplicativeOperators[parentOp]) ||
    (parentOp === '%' && multiplicativeOperators[nodeOp])
  ) {
    return false
  }

  // x * y / z --> (x * y) / z
  // x / y * z --> (x / y) * z
  if (
    nodeOp !== parentOp &&
    multiplicativeOperators[nodeOp] &&
    multiplicativeOperators[parentOp]
  ) {
    return false
  }

  // x << y << z --> (x << y) << z
  if (bitshiftOperators[parentOp] && bitshiftOperators[nodeOp]) {
    return false
  }

  return true
}

function isEqualityOperator(op) {
  return op === '===' || op === '!=='
}

const operatorAliasMap = {
  or: '||',
  and: '&&',
  '==': '===',
  '!=': '!==',
  is: '===',
  isnt: '!==',
}
function shouldFlatten(parent, node) {
  const parentOp = getCanonicalOperator(parent)
  const nodeOp = getCanonicalOperator(node)
  if (isEqualityOperator(parentOp) && isEqualityOperator(nodeOp)) {
    return true
  }
  return shouldFlattenJs(parentOp, nodeOp)
}
// function shouldFlatten(parentOp, nodeOp) {
//   parentOp = getCanonicalOperator(parentOp)
//   nodeOp = getCanonicalOperator(nodeOp)
//   // console.log({
//   //   parentOp,
//   //   nodeOp,
//   //   parentPrec: getPrecedence(parentOp),
//   //   nodePrec: getPrecedence(nodeOp),
//   // })
//   if (getPrecedence(nodeOp) !== getPrecedence(parentOp)) {
//     return false
//   }

//   return true
// }

module.exports = {
  isNextLineEmpty,
  hasSameStartLine,
  getNextNonSpaceNonCommentCharacter,
  getNextNonSpaceNonCommentCharacterIndexWithStartIndex,
  isFunction,
  hasNewline,
  skipNewline,
  getLast,
  getPenultimate,
  isBitwiseOperator,
  hasNewlineInRange,
  printNumber,
  makeString,
  shouldFlatten,
  getCanonicalOperator,
  skipSpaces,
  isPreviousLineEmpty,
  getPrecedence,
}

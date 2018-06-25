'use strict'

const {hasNewline, skipNewline} = require('prettier/src/common/util')

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

function getNextNonSpaceNonCommentCharacterIndex(text, node, locEnd) {
  let oldIdx = null
  let idx = locEnd(node)
  while (idx !== oldIdx) {
    oldIdx = idx
    idx = skipSpaces(text, idx)
    idx = skipInlineComment(text, idx)
    idx = skipNewline(text, idx)
  }
  return idx
}

function getNextNonSpaceNonCommentCharacter(text, node, locEnd) {
  return text.charAt(
    getNextNonSpaceNonCommentCharacterIndex(text, node, locEnd)
  )
}

module.exports = {
  isNextLineEmpty,
  hasSameStartLine,
  getNextNonSpaceNonCommentCharacter,
}

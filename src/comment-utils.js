'use strict'

const {
  join,
  hardline,
  indent,
  concat,
  cursor,
  lineSuffix,
  breakParent,
  line,
} = require('prettier').doc.builders

const util = require('./util')
const {skipNewline, skipSpaces, hasNewline, isPreviousLineEmpty} = util

function printComment(commentPath, options) {
  const comment = commentPath.getValue()
  comment.printed = true
  return options.printer.printComment(commentPath, options)
}

function printLeadingComment(commentPath, options) {
  const comment = commentPath.getValue()
  const contents = printComment(commentPath, options)
  if (!contents) {
    return ''
  }
  const isBlock =
    options.printer.isBlockComment && options.printer.isBlockComment(comment)

  // Leading block comments should see if they need to stay on the
  // same line or not.
  if (isBlock) {
    const lineBreak = hasNewline(options.originalText, options.locEnd(comment))
      ? hasNewline(options.originalText, options.locStart(comment), {
          backwards: true,
        })
        ? hardline
        : line
      : ' '

    return concat([contents, lineBreak])
  }

  return concat([contents, hardline])
}

function printDanglingComments(path, options, sameIndent, filter) {
  const parts = []
  const node = path.getValue()

  if (!node || !node.comments) {
    return ''
  }

  path.each((commentPath) => {
    const comment = commentPath.getValue()
    if (
      comment &&
      !comment.leading &&
      !comment.trailing &&
      (!filter || filter(comment))
    ) {
      parts.push(printComment(commentPath, options))
    }
  }, 'comments')

  if (parts.length === 0) {
    return ''
  }

  if (sameIndent) {
    return join(hardline, parts)
  }
  return indent(concat([hardline, join(hardline, parts)]))
}

function printTrailingComment(commentPath, options) {
  const comment = commentPath.getValue()
  const contents = printComment(commentPath, options)
  if (!contents) {
    return ''
  }
  const {printer, originalText, locStart} = options
  const isBlock = printer.isBlockComment && printer.isBlockComment(comment)

  if (hasNewline(originalText, locStart(comment), {backwards: true})) {
    // This allows comments at the end of nested structures:
    // {
    //   x: 1,
    //   y: 2
    //   // A comment
    // }
    // Those kinds of comments are almost always leading comments, but
    // here it doesn't go "outside" the block and turns it into a
    // trailing comment for `2`. We can simulate the above by checking
    // if this a comment on its own line; normal trailing comments are
    // always at the end of another expression.

    const isLineBeforeEmpty = isPreviousLineEmpty(
      originalText,
      comment,
      locStart
    )

    return lineSuffix(
      concat([hardline, isLineBeforeEmpty ? hardline : '', contents])
    )
  }

  let printed = concat([' ', contents])

  // Trailing block comments never need a newline
  if (!isBlock) {
    printed = concat([lineSuffix(printed), breakParent])
  }

  return printed
}

function prependCursorPlaceholder(path, options, printed) {
  if (path.getNode() === options.cursorNode && path.getValue()) {
    return concat([cursor, printed, cursor])
  }
  return printed
}

function printComments(path, print, options, needsSemi) {
  const value = path.getValue()
  const printed = print(path)
  const comments = value && value.comments

  if (!comments || comments.length === 0) {
    return prependCursorPlaceholder(path, options, printed)
  }

  const leadingParts = []
  const trailingParts = [needsSemi ? ';' : '', printed]

  path.each((commentPath) => {
    const comment = commentPath.getValue()
    const {leading, trailing} = comment

    if (leading) {
      const contents = printLeadingComment(commentPath, options)
      if (!contents) {
        return
      }
      leadingParts.push(contents)

      const text = options.originalText
      const index = skipNewline(text, skipSpaces(text, options.locEnd(comment)))
      if (index !== false && hasNewline(text, index)) {
        leadingParts.push(hardline)
      }
    } else if (trailing) {
      trailingParts.push(printTrailingComment(commentPath, options))
    }
  }, 'comments')

  return prependCursorPlaceholder(
    path,
    options,
    concat(leadingParts.concat(trailingParts))
  )
}

function addCommentHelper(node, comment) {
  const comments = node.comments || (node.comments = [])
  comments.push(comment)
  comment.printed = false

  // For some reason, TypeScript parses `// x` inside of JSXText as a comment
  // We already "print" it via the raw text, we don't need to re-print it as a
  // comment
  if (node.type === 'JSXText') {
    comment.printed = true
  }
}

function addLeadingComment(node, comment) {
  comment.leading = true
  comment.trailing = false
  addCommentHelper(node, comment)
}

function addDanglingComment(node, comment, marker) {
  comment.leading = false
  comment.trailing = false
  if (marker) {
    comment.marker = marker
  }
  addCommentHelper(node, comment)
}

function addTrailingComment(node, comment) {
  comment.leading = false
  comment.trailing = true
  addCommentHelper(node, comment)
}

module.exports = {
  printDanglingComments,
  printComments,
  addLeadingComment,
  addDanglingComment,
  addTrailingComment,
}

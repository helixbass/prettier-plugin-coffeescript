'use strict'

const sharedUtil = require('prettier/src/common/util-shared')
const {getNextNonSpaceNonCommentCharacter} = require('./util')

const addLeadingComment = sharedUtil.addLeadingComment
// const addTrailingComment = sharedUtil.addTrailingComment
const addDanglingComment = sharedUtil.addDanglingComment

function handleOwnLineComment(comment, text, options, ast, isLastComment) {
  // const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  // const followingNode = comment.followingNode
  if (
    handleOnlyComments(enclosingNode, comment, isLastComment) ||
    handleAssignmentPatternComments(enclosingNode, comment)
  ) {
    return true
  }
  return false
}

function handleEndOfLineComment(comment, text, options, ast, isLastComment) {
  // const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  // const followingNode = comment.followingNode
  if (handleOnlyComments(enclosingNode, comment, isLastComment)) {
    return true
  }
  return false
}

function handleRemainingComment(comment, text, options, ast, isLastComment) {
  const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  // const followingNode = comment.followingNode
  if (
    handleOnlyComments(enclosingNode, comment, isLastComment) ||
    handleFunctionNameComments(
      text,
      enclosingNode,
      precedingNode,
      comment,
      options
    )
  ) {
    return true
  }
  return false
}

function handleOnlyComments(enclosingNode, comment, isLastComment) {
  if (
    enclosingNode &&
    enclosingNode.type === 'Program' &&
    enclosingNode.body.length === 0 &&
    enclosingNode.directives &&
    enclosingNode.directives.length === 0
  ) {
    if (isLastComment) {
      addDanglingComment(enclosingNode, comment)
    } else {
      addLeadingComment(enclosingNode, comment)
    }
    return true
  }
  return false
}

function handleFunctionNameComments(
  text,
  enclosingNode,
  precedingNode,
  comment,
  options
) {
  const nextChar = getNextNonSpaceNonCommentCharacter(
    text,
    comment,
    options.locEnd
  )
  if (nextChar !== '(' && nextChar !== '-') {
    return false
  }

  if (precedingNode && enclosingNode && enclosingNode.type === 'ClassMethod') {
    // addTrailingComment(precedingNode, comment)
    addDanglingComment(enclosingNode, comment)
    return true
  }
}

function handleAssignmentPatternComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === 'AssignmentPattern') {
    addLeadingComment(enclosingNode, comment)
    return true
  }
  return false
}

function isBlockComment(comment) {
  return comment.type === 'CommentBlock'
}

module.exports = {
  handleOwnLineComment,
  handleEndOfLineComment,
  handleRemainingComment,
  isBlockComment,
}

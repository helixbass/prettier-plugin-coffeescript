'use strict'

const sharedUtil = require('prettier/src/common/util-shared')
const {getNextNonSpaceNonCommentCharacter} = require('./util')

const addLeadingComment = sharedUtil.addLeadingComment
// const addTrailingComment = sharedUtil.addTrailingComment
const addDanglingComment = sharedUtil.addDanglingComment

// function handleOwnLineComment(comment, text, options, ast, isLastComment) {
function handleOwnLineComment(comment) {
  // const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  // const followingNode = comment.followingNode
  if (handleAssignmentPatternComments(enclosingNode, comment)) {
    return true
  }
  return false
}

// function handleRemainingComment(comment, text, options, ast, isLastComment) {
function handleRemainingComment(comment, text, options) {
  const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  // const followingNode = comment.followingNode
  if (
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
  handleRemainingComment,
  isBlockComment,
}

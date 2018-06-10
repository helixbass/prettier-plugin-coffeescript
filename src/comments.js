'use strict'

const sharedUtil = require('prettier/src/common/util-shared')

const addLeadingComment = sharedUtil.addLeadingComment
// const addTrailingComment = sharedUtil.addTrailingComment
// const addDanglingComment = sharedUtil.addDanglingComment

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
  isBlockComment,
}

'use strict'

const sharedUtil = require('prettier/src/common/util-shared')
const {getNextNonSpaceNonCommentCharacter} = require('./util')

const addLeadingComment = sharedUtil.addLeadingComment
const addTrailingComment = sharedUtil.addTrailingComment
const addDanglingComment = sharedUtil.addDanglingComment

function handleOwnLineComment(comment, text, options, ast, isLastComment) {
  const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  const followingNode = comment.followingNode
  if (
    handleLastFunctionArgComments(
      text,
      precedingNode,
      enclosingNode,
      followingNode,
      comment,
      options
    ) ||
    handleMemberExpressionComments(enclosingNode, followingNode, comment) ||
    handleIfStatementComments(
      text,
      precedingNode,
      enclosingNode,
      followingNode,
      comment
    ) ||
    handleTryStatementComments(enclosingNode, followingNode, comment) ||
    handleOnlyComments(enclosingNode, comment, isLastComment) ||
    handleAssignmentPatternComments(enclosingNode, comment)
  ) {
    return true
  }
  return false
}

function handleEndOfLineComment(comment, text, options, ast, isLastComment) {
  const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  const followingNode = comment.followingNode
  if (
    handleLastFunctionArgComments(
      text,
      precedingNode,
      enclosingNode,
      followingNode,
      comment,
      options
    ) ||
    handleIfStatementComments(
      text,
      precedingNode,
      enclosingNode,
      followingNode,
      comment
    ) ||
    handleCallExpressionComments(precedingNode, enclosingNode, comment) ||
    handleOnlyComments(enclosingNode, comment, isLastComment) ||
    handleVariableDeclaratorComments(enclosingNode, followingNode, comment)
  ) {
    return true
  }
  return false
}

function handleRemainingComment(comment, text, options, ast, isLastComment) {
  const precedingNode = comment.precedingNode
  const enclosingNode = comment.enclosingNode
  const followingNode = comment.followingNode
  if (
    handleIfStatementComments(
      text,
      precedingNode,
      enclosingNode,
      followingNode,
      comment
    ) ||
    handleCommentInEmptyParens(text, enclosingNode, comment, options) ||
    handleOnlyComments(enclosingNode, comment, isLastComment) ||
    handleFunctionNameComments(text, enclosingNode, comment, options)
  ) {
    return true
  }
  return false
}

function handleVariableDeclaratorComments(
  enclosingNode,
  followingNode,
  comment
) {
  if (
    enclosingNode &&
    enclosingNode.type === 'AssignmentExpression' &&
    followingNode &&
    (followingNode.type === 'ObjectExpression' ||
      followingNode.type === 'ArrayExpression' ||
      followingNode.type === 'TemplateLiteral' ||
      followingNode.type === 'StringLiteral' ||
      followingNode.type === 'TaggedTemplateExpression')
  ) {
    addLeadingComment(followingNode, comment)
    return true
  }
  return false
}

function handleMemberExpressionComments(enclosingNode, followingNode, comment) {
  if (
    enclosingNode &&
    enclosingNode.type === 'MemberExpression' &&
    followingNode &&
    (followingNode.type === 'Identifier' ||
      followingNode.type === 'CallExpression') // TODO: this is so that eg memberInAndOutWithCalls test won't break, but should probably correctly print as leading comment (here and for JS)
  ) {
    addLeadingComment(enclosingNode, comment)
    return true
  }

  return false
}

// function handleIfStatementComments(text, precedingNode, enclosingNode, followingNode, comment, options) {
function handleIfStatementComments(
  text,
  precedingNode,
  enclosingNode,
  followingNode,
  comment
) {
  if (
    !enclosingNode ||
    !(
      enclosingNode.type === 'IfStatement' ||
      enclosingNode.type === 'ConditionalExpression'
    ) ||
    !followingNode
  ) {
    return false
  }

  if (
    precedingNode === enclosingNode.consequent &&
    followingNode === enclosingNode.alternate
  ) {
    // if (precedingNode.type === 'BlockStatement') {
    //   addTrailingComment(precedingNode, comment)
    // } else {
    addDanglingComment(enclosingNode, comment)
    // }
    return true
  }

  return false
}

function handleTryStatementComments(enclosingNode, followingNode, comment) {
  if (
    !enclosingNode ||
    enclosingNode.type !== 'TryStatement' ||
    !followingNode
  ) {
    return false
  }

  if (followingNode.type === 'BlockStatement') {
    addBlockStatementFirstComment(followingNode, comment)
    return true
  }

  if (followingNode.type === 'TryStatement') {
    addBlockOrNotComment(followingNode.finalizer, comment)
    return true
  }

  if (followingNode.type === 'CatchClause') {
    addBlockOrNotComment(followingNode.body, comment)
    return true
  }

  return false
}

function addBlockStatementFirstComment(node, comment) {
  const body = node.body.filter(n => n.type !== 'EmptyStatement')
  if (body.length === 0) {
    addDanglingComment(node, comment)
  } else {
    addLeadingComment(body[0], comment)
  }
}

function addBlockOrNotComment(node, comment) {
  if (node.type === 'BlockStatement') {
    addBlockStatementFirstComment(node, comment)
  } else {
    addLeadingComment(node, comment)
  }
}

function handleLastFunctionArgComments(
  text,
  precedingNode,
  enclosingNode,
  followingNode,
  comment,
  options
) {
  if (
    precedingNode &&
    (precedingNode.type === 'Identifier' ||
      precedingNode.type === 'AssignmentPattern') &&
    enclosingNode &&
    (enclosingNode.type === 'FunctionExpression' ||
      enclosingNode.type === 'ClassMethod') &&
    getNextNonSpaceNonCommentCharacter(text, comment, options.locEnd) === ')'
  ) {
    addTrailingComment(precedingNode, comment)
    return true
  }
  return false
}

function handleCommentInEmptyParens(text, enclosingNode, comment, options) {
  if (
    getNextNonSpaceNonCommentCharacter(text, comment, options.locEnd) !== ')'
  ) {
    return false
  }

  if (
    enclosingNode &&
    (enclosingNode.type === 'FunctionExpression' ||
      enclosingNode.type === 'ClassMethod') &&
    enclosingNode.params.length === 0
  ) {
    addDanglingComment(enclosingNode, comment)
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

function handleFunctionNameComments(text, enclosingNode, comment, options) {
  const nextChar = getNextNonSpaceNonCommentCharacter(
    text,
    comment,
    options.locEnd
  )
  if (nextChar !== '(' && nextChar !== '-') {
    return false
  }

  if (
    enclosingNode &&
    (enclosingNode.type === 'FunctionExpression' ||
      enclosingNode.type === 'ClassMethod')
  ) {
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

function handleCallExpressionComments(precedingNode, enclosingNode, comment) {
  if (
    enclosingNode &&
    enclosingNode.type === 'CallExpression' &&
    precedingNode &&
    enclosingNode.callee === precedingNode &&
    enclosingNode.arguments.length > 0
  ) {
    addLeadingComment(enclosingNode.arguments[0], comment)
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

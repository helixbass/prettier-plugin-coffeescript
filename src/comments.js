'use strict'

function isBlockComment(comment) {
  return comment.type === 'CommentBlock'
}

module.exports = {
  isBlockComment,
}

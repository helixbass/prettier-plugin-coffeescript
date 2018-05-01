'use strict'

const docBuilders = require('prettier').doc.builders
const concat = docBuilders.concat
const hardline = docBuilders.hardline

function embed(path, print, textToDoc, options) {
  return concat([path])
}

module.exports = embed

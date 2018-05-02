'use strict'

const docBuilders = require('prettier').doc.builders
const { concat } = docBuilders

// function embed(path, print, textToDoc, options) {
function embed(path) {
  return concat([path])
}

module.exports = embed

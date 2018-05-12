'use strict'

const parse = require('./parser')
const printer = require('./printer')

// Based on:
// https://github.com/github/linguist/blob/master/lib/linguist/languages.yml

const languages = [
  {
    name: 'CoffeeScript',
    since: '1.10.0',
    parsers: ['coffeescript'],
    group: 'CoffeeScript',
    tmScope: 'source.coffee',
    aceMode: 'coffee',
    codemirrorMode: 'coffeescript',
    codemirrorMimeType: 'text/x-coffeescript',
    aliases: ['coffee', 'coffee-script'],
    extensions: ['.coffee', '._coffee', '.cake', '.cjsx', '.iced'],
    filenames: ['Cakefile'],
    linguistLanguageId: 63,
    vscodeLanguageIds: ['coffeescript'],
  },
  {
    name: 'Literate CoffeeScript',
    since: '1.10.0',
    parsers: ['coffeescript'],
    group: 'CoffeeScript',
    tmScope: 'source.litcoffee',
    aceMode: 'text',
    aliases: ['litcoffee'],
    extensions: ['.litcoffee'],
    filenames: ['Cakefile'],
    linguistLanguageId: 206,
  },
  {
    name: 'CSON',
    since: '1.10.0',
    parsers: ['coffeescript'],
    group: 'CoffeeScript',
    tmScope: 'source.coffee',
    aceMode: 'coffee',
    codemirrorMode: 'coffeescript',
    codemirrorMimeType: 'text/x-coffeescript',
    extensions: ['.cson'],
    linguistLanguageId: 424,
  },
  {
    name: 'EmberScript',
    since: '1.10.0',
    parsers: ['coffeescript'],
    group: 'CoffeeScript',
    tmScope: 'source.coffee',
    aceMode: 'coffee',
    codemirrorMode: 'coffeescript',
    codemirrorMimeType: 'text/x-coffeescript',
    extensions: ['.em', '.emberscript'],
    linguistLanguageId: 103,
  },
]

const parsers = {
  coffeescript: {
    parse,
    astFormat: 'coffeescript',
  },
}

const printers = {
  coffeescript: printer,
}

const options = {
  indentChain: {
    type: 'boolean',
    category: 'Global',
    default: false,
    description: 'Indent chained (non-initial) lines of a member call chain',
  },
}

module.exports = {
  languages,
  parsers,
  printers,
  options,
}

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

function locStart(node) {
  if (node.range) {
    return node.range[0]
  }
}

function locEnd(node) {
  if (node.range) {
    return node.range[1]
  }
}

const parsers = {
  coffeescript: {
    parse,
    astFormat: 'coffeescript',
    locStart,
    locEnd,
  },
}

const printers = {
  coffeescript: printer,
}

const options = {
  indentChain: {
    type: 'boolean',
    category: 'Global',
    default: true,
    description: 'Indent chained (non-initial) lines of a member call chain',
  },
  comma: {
    type: 'choice',
    choices: [
      {value: 'none', description: 'No commas'},
      {value: 'nonTrailing', description: 'Include commas except trailing'},
      {value: 'all', description: 'Include commas'},
    ],
    category: 'Global',
    default: 'none',
    description:
      'Include commas when breaking call args, function params, arrays or explicit objects',
  },
  respectBreak: {
    array: true,
    type: 'choice',
    choices: [
      {
        value: 'control',
        description: "Don't inline indented control structures",
      },
      {
        value: 'functionBody',
        description: "Don't inline indented function bodies",
      },
      {value: 'object', description: "Don't inline multiline objects"},
    ],
    category: 'Global',
    default: [{value: ['control', 'functionBody', 'object']}],
    description: "Don't inline multiline constructs",
  },
  noImplicit: {
    array: true,
    type: 'choice',
    choices: [
      {
        value: 'callParens',
        description: "Don't ever use implicit call parentheses",
      },
      {
        value: 'objectBraces',
        description: "Don't ever use implicit object braces",
      },
    ],
    category: 'Global',
    default: [{value: []}],
    description: "Don't use implicit constructs",
  },
  singleQuote: {
    type: 'boolean',
    category: 'Common',
    default: true,
    description: 'Use single quotes instead of double quotes.',
  },
  respectExplicit: {
    array: true,
    type: 'choice',
    choices: [
      {
        value: 'callParens',
        description: "Don't make explicit call parentheses implicit",
      },
      {
        value: 'objectBraces',
        description: "Don't make explicit object braces implicit",
      },
    ],
    category: 'Global',
    default: [{value: []}],
    description: "Don't make explicit constructs implicit",
  },
  inlineAssignmentsTo: {
    array: true,
    type: 'choice',
    choices: [
      {
        value: 'control',
        description: 'Inline right sides of assignments to control structures',
      },
      // {
      //   value: 'chain',
      //   description:
      //     'Inline right sides of assignments to member expressions/chains when indentChain: true',
      // },
    ],
    category: 'Global',
    default: [
      {
        value: [
          'control',
          // , 'chain'
        ],
      },
    ],
    description: 'Inline right sides of assignments',
  },
  emptyParamListParens: {
    type: 'boolean',
    category: 'Common',
    default: false,
    description:
      'Include an empty set of parens for an empty function parameter list.',
  },
}

module.exports = {
  languages,
  parsers,
  printers,
  options,
}

'use strict'

const util = require('prettier/src/common/util')
const embed = require('./embed')
const { IDENTIFIER } = require('coffeescript/lib/coffeescript/lexer')

const { doc } = require('prettier')
const docBuilders = doc.builders
const {
  breakParent,
  concat,
  conditionalGroup,
  fill,
  group,
  hardline,
  ifBreak,
  indent,
  join,
  literalline,
  line,
  softline,
} = docBuilders
const docUtils = doc.utils
const { isEmpty, isLineNext, rawText, willBreak } = docUtils

const sysUtil = require('util')

function isStatement(node) {
  return (
    node.type === 'BlockStatement' ||
    node.type === 'ExpressionStatement' ||
    // node.type === 'WhileStatement' ||
    node.type === 'IfStatement'
  )
}

function pathNeedsParens(path) {
  const parent = path.getParentNode()
  if (!parent) {
    return false
  }

  const name = path.getName()
  const node = path.getNode()

  if (isStatement(node)) {
    return false
  }

  if (node.type === 'Identifier') {
    return false
  }

  switch (node.type) {
    case 'CallExpression': {
      let firstParentNotMemberExpression = parent
      let i = 0
      while (
        firstParentNotMemberExpression &&
        firstParentNotMemberExpression.type === 'MemberExpression'
      ) {
        firstParentNotMemberExpression = path.getParentNode(++i)
      }

      if (
        firstParentNotMemberExpression.type === 'NewExpression' &&
        firstParentNotMemberExpression.callee === path.getParentNode(i - 1)
      ) {
        return true
      }
      return false
    }
    case 'UpdateExpression':
      if (parent.type === 'UnaryExpression') {
        return (
          node.prefix &&
          ((node.operator === '++' && parent.operator === '+') ||
            (node.operator === '--' && parent.operator === '-'))
        )
      }
    // else fallthrough
    case 'UnaryExpression':
      switch (parent.type) {
        case 'UnaryExpression':
          return (
            node.operator === parent.operator &&
            (node.operator === '+' || node.operator === '-')
          )

        case 'MemberExpression':
          return name === 'object' && parent.object === node

        case 'NewExpression':
        case 'CallExpression':
          return name === 'callee' && parent.callee === node
        default:
          return false
      }
    case 'BinaryExpression':
    case 'LogicalExpression':
      switch (parent.type) {
        case 'CallExpression':
        case 'NewExpression':
          return name === 'callee' && parent.callee === node
        case 'BinaryExpression':
        case 'LogicalExpression': {
          const po = getCanonicalOperator(parent.operator)
          const pp = getPrecedence(po)
          const no = getCanonicalOperator(node.operator)
          const np = getPrecedence(no)

          if (pp > np) {
            return true
          }

          if ((po === 'or' || po === '?') && no === 'and') {
            return true
          }

          if (pp === np && name === 'right') {
            return true
          }

          return false
        }
        default:
          return false
      }
    case 'ConditionalExpression':
      switch (parent.type) {
        case 'NewExpression':
        case 'CallExpression':
          return name === 'callee' && parent.callee === node
        case 'BinaryExpression':
        case 'LogicalExpression':
          return name === 'right' && parent.right === node
        case 'JSXSpreadAttribute':
          return true
        default:
          return false
      }
    case 'ClassExpression':
      return (
        parent.type === 'ExportDefaultDeclaration' ||
        (parent.type === 'BinaryExpression' &&
          parent.left === node &&
          node.superClass) ||
        (parent.type === 'CallExpression' && parent.callee === node) ||
        (parent.type === 'MemberExpression' && parent.object === node) ||
        (isIf(parent) && parent.test === node)
      )
  }

  return false
}

function genericPrint(path, options, print) {
  const node = path.getValue()
  const linesWithoutParens = printPathNoParens(path, options, print)

  if (!node || isEmpty(linesWithoutParens)) {
    return linesWithoutParens
  }

  const needsParens = pathNeedsParens(path)

  const parts = []
  if (needsParens) {
    parts.unshift('(')
  }

  parts.push(linesWithoutParens)

  if (needsParens) {
    parts.push(')')
  }

  return concat(parts)
}

// eslint-disable-next-line no-unused-vars
function dump(obj) {
  // eslint-disable-next-line no-console
  return console.log(sysUtil.inspect(obj, { depth: 30 }))
}

function printPathNoParens(path, options, print) {
  // return dump(path)
  const n = path.getValue()

  if (!n) {
    return ''
  }

  if (typeof n === 'string') {
    return n
  }

  let parts = []
  switch (n.type) {
    case 'File':
      return path.call(print, 'program')
    case 'Program':
      parts.push(
        path.call(bodyPath => {
          return printStatementSequence(bodyPath, options, print)
        }, 'body')
      )

      if (n.body.length) {
        parts.push(hardline)
      }

      return concat(parts)
    case 'ExpressionStatement':
      return path.call(print, 'expression')
    case 'AssignmentExpression':
      return printAssignment(
        n.left,
        path.call(print, 'left'),
        concat([' ', n.operator]),
        n.right,
        path.call(print, 'right'),
        options
      )
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const parent = path.getParentNode()
      const parentParent = path.getParentNode(1)
      const isInsideParenthesis =
        n !== parent.body && (isIf(parent) || parent.type === 'WhileStatement')

      const { parts, breaks } = printBinaryishExpressions(
        path,
        print,
        options,
        false
      )

      if (isInsideParenthesis) {
        return concat(parts)
      }

      const shouldNotIndent =
        parent.type === 'JSXExpressionContainer' &&
        parentParent.type === 'JSXAttribute'
      const shouldIndentIfInlining = parent.type === 'AssignmentExpression'

      // if (shouldInlineLogicalExpression(n) && !samePrecedenceSubExpression)
      if (
        shouldNotIndent ||
        (!shouldInlineLogicalExpression(n) && shouldIndentIfInlining)
      ) {
        return group(concat(parts))
      }

      const rest = concat(parts.slice(1))

      return group(
        concat([parts.length > 0 ? parts[0] : '', breaks ? indent(rest) : rest])
      )
    }
    case 'AssignmentPattern':
      return concat([
        path.call(print, 'left'),
        ' = ',
        path.call(print, 'right'),
      ])
    case 'ObjectExpression':
    case 'ObjectPattern': {
      const parent = path.getParentNode()
      const props = []
      path.each(childPath => {
        const node = childPath.getValue()
        props.push({
          node,
          printed: print(childPath),
        })
      }, 'properties')
      let separatorParts = []
      const joinedProps = props.map(prop => {
        const result = concat(separatorParts.concat(group(prop.printed)))
        separatorParts = [ifBreak('', ','), line]
        if (util.isNextLineEmpty(options.originalText, prop.node)) {
          separatorParts.push(hardline)
        }
        return result
      })

      if (joinedProps.length === 0) {
        return concat(['{', '}'])
      }

      const shouldOmitBraces = shouldOmitObjectBraces(path)
      let shouldOmitBracesButNotIndent = false
      if (shouldOmitBraces && !shouldOmitBraces.indent) {
        shouldOmitBracesButNotIndent = true
      }
      const shouldBreak = parent.type === 'ClassBody'
      const dontIndent =
        shouldOmitBracesButNotIndent || parent.type === 'ClassBody'
      const content = concat([
        shouldOmitBraces ? '' : '{',
        dontIndent
          ? concat(joinedProps)
          : indent(
              concat([
                options.bracketSpacing && !shouldOmitBraces ? line : softline,
                concat(joinedProps),
              ])
            ),
        concat([
          dontIndent
            ? ''
            : options.bracketSpacing && !shouldOmitBraces ? line : softline,
          shouldOmitBraces ? '' : '}',
        ]),
      ])

      return group(content, { shouldBreak })
    }
    case 'ObjectProperty':
      if (n.shorthand) {
        parts.push(path.call(print, 'value'))
      } else {
        let printedLeft
        if (n.computed) {
          printedLeft = concat(['[', path.call(print, 'key'), ']'])
        } else {
          printedLeft = printPropertyKey(path, options, print)
        }
        parts.push(
          printAssignment(
            n.key,
            printedLeft,
            ':',
            n.value,
            path.call(print, 'value'),
            options
          )
        )
      }

      return concat(parts)
    case 'ClassMethod':
      if (n.static) {
        parts.push('@')
      }

      parts = parts.concat(printObjectMethod(path, options, print))

      return concat(parts)
    case 'ArrayExpression':
    case 'ArrayPattern':
      parts.push(
        group(
          concat([
            '[',
            indent(
              concat([
                softline,
                printArrayItems(path, options, 'elements', print),
              ])
            ),
            softline,
            ']',
          ])
        )
      )
      return concat(parts)
    case 'ThisExpression':
      return '@'
    case 'Super':
      return 'super'
    case 'NullLiteral':
      return 'null'
    case 'Identifier':
      return concat([n.name])
    case 'MemberExpression': {
      const shouldInline = n.computed || isThisLookup(n)

      return concat([
        path.call(print, 'object'),
        shouldInline
          ? printMemberLookup(path, options, print)
          : group(
              indent(
                concat([softline, printMemberLookup(path, options, print)])
              )
            ),
      ])
    }
    case 'SpreadElement':
    case 'RestElement':
      return concat([path.call(print, 'argument'), '...'])
    case 'FunctionExpression': {
      parts.push(group(printFunctionParams(path, print, options)))

      parts.push(n.bound ? '=>' : '->')

      const body = isEmptyBlock(n.body)
        ? ''
        : concat([
            ifBreak('', ' '),
            path.call(bodyPath => print(bodyPath), 'body'),
          ])

      return group(concat([concat(parts), body]))
    }
    case 'ImportSpecifier':
      parts.push(path.call(print, 'imported'))

      if (n.local && n.local.name !== n.imported.name) {
        parts.push(' as ', path.call(print, 'local'))
      }

      return concat(parts)
    case 'ExportSpecifier':
      parts.push(path.call(print, 'local'))

      if (n.exported && n.exported.name !== n.local.name) {
        parts.push(' as ', path.call(print, 'exported'))
      }

      return concat(parts)
    case 'ImportNamespaceSpecifier':
      parts.push('* as ')

      parts.push(path.call(print, 'local'))

      return concat(parts)
    case 'ImportDefaultSpecifier':
      return path.call(print, 'local')
    case 'ExportDefaultDeclaration':
    case 'ExportNamedDeclaration':
      return printExportDeclaration(path, options, print)
    case 'ExportAllDeclaration':
      parts.push('export ')

      parts.push('* from ', path.call(print, 'source'))

      return concat(parts)
    case 'ImportDeclaration': {
      parts.push('import ')

      const standalones = []
      const grouped = []
      if (n.specifiers && n.specifiers.length > 0) {
        path.each(specifierPath => {
          const value = specifierPath.getValue()
          if (
            value.type === 'ImportDefaultSpecifier' ||
            value.type === 'ImportNamespaceSpecifier'
          ) {
            standalones.push(print(specifierPath))
          } else {
            grouped.push(print(specifierPath))
          }
        }, 'specifiers')

        if (standalones.length > 0) {
          parts.push(join(', ', standalones))
        }

        if (standalones.length > 0 && grouped.length > 0) {
          parts.push(', ')
        }

        if (grouped.length === 1 && standalones.length === 0 && n.specifiers) {
          parts.push(
            concat([
              '{',
              options.bracketSpacing ? ' ' : '',
              concat(grouped),
              options.bracketSpacing ? ' ' : '',
              '}',
            ])
          )
        } else if (grouped.length >= 1) {
          parts.push(
            group(
              concat([
                '{',
                indent(
                  concat([
                    options.bracketSpacing ? line : softline,
                    join(concat([ifBreak('', ','), line]), grouped),
                  ])
                ),
                options.bracketSpacing ? line : softline,
                '}',
              ])
            )
          )
        }

        parts.push(' from ')
      } else if (
        /{\s*}/.test(
          options.originalText.slice(locStart(n), locStart(n.source))
        )
      ) {
        parts.push('{} from ')
      }

      parts.push(path.call(print, 'source'))

      return concat(parts)
    }
    case 'BlockStatement': {
      const naked = path.call(bodyPath => {
        return printStatementSequence(bodyPath, options, print)
      }, 'body')

      const hasContent = n.body.length > 0

      const parent = path.getParentNode()
      if (
        !hasContent &&
        ((parent.type === 'IfStatement' && n === parent.consequent) ||
          (parent.type === 'WhileStatement' && n === parent.body))
      ) {
        return indent(concat([hardline, ';']))
      }

      const shouldInline = n.body.length === 1
      if (shouldInline) {
        parts.push(indent(concat([softline, naked])))
      } else {
        parts.push(indent(concat([hardline, naked])))
      }

      return concat(parts)
    }
    case 'ReturnStatement':
      parts.push('return')

      if (n.argument) {
        const shouldBreak = n.argument.type === 'JSXElement'
        if (shouldBreak) {
          parts.push(
            group(
              concat([
                ifBreak(' (', ' '),
                indent(concat([softline, path.call(print, 'argument')])),
                softline,
                ifBreak(')'),
              ])
            )
          )
        } else {
          parts.push(' ', path.call(print, 'argument'))
        }
      }

      return concat(parts)
    case 'NewExpression':
    case 'CallExpression': {
      const isNew = n.type === 'NewExpression'

      const optional = printOptionalToken(path)

      if (isTestCall(n, path.getParentNode())) {
        return concat([
          path.call(print, 'callee'),
          optional,
          concat([' ', join(', ', path.map(print, 'arguments'))]),
        ])
      }

      if (!isNew && isMemberish(n.callee)) {
        return printMemberChain(path, options, print)
      }

      return concat([
        isNew ? 'new ' : '',
        path.call(print, 'callee'),
        optional,
        printArgumentsList(path, options, print),
      ])
    }
    case 'NumericLiteral':
      return util.printNumber(n.extra.raw)
    case 'StringLiteral':
      return nodeStr(n, options)
    case 'UnaryExpression': {
      let { operator } = n
      if (isLogicalNotExpression(n)) {
        if (
          !(
            isLogicalNotExpression(n.argument) ||
            isLogicalNotExpression(path.getParentNode())
          )
        ) {
          operator = 'not'
        }
      }
      parts.push(operator)

      if (/[a-z]$/.test(operator)) {
        parts.push(' ')
      }

      parts.push(path.call(print, 'argument'))

      return concat(parts)
    }
    case 'Existence':
      parts.push(path.call(print, 'argument'), '?')

      return concat(parts)
    case 'UpdateExpression':
      parts.push(path.call(print, 'argument'), n.operator)

      if (n.prefix) {
        parts.reverse()
      }

      return concat(parts)
    case 'ConditionalExpression':
    case 'IfStatement': {
      const simpleTest = path.call(print, 'test')
      const breakingTest = group(
        concat([
          ifBreak('('),
          indent(concat([softline, simpleTest])),
          softline,
          ifBreak(')'),
        ])
      )
      const keyword = n.inverted ? 'unless ' : 'if '
      const dontBreakTest = n.test.type === 'CallExpression'
      const test = dontBreakTest ? simpleTest : breakingTest

      if (n.postfix) {
        parts.push(path.call(print, 'consequent'), ' ')
        parts.push(keyword, test)
        return concat(parts)
      }

      // const isStatement = n.type === 'IfStatement'
      // const shouldBreak = isStatement
      const shouldBreak = !pathNeedsParens(path)
      const shouldIndent = !shouldBreak

      const con = adjustClause(n.consequent, path.call(print, 'consequent'))

      const opening = concat([
        shouldIndent ? softline : '',
        keyword,
        test,
        ifBreak('', ' then'),
        con,
      ])
      parts.push(opening)

      if (n.alternate) {
        const alternate = path.call(print, 'alternate')
        const isChainedElseIf = isIf(n.alternate)
        const alt = isChainedElseIf
          ? concat([' ', alternate])
          : adjustClause(n.alternate, alternate)
        parts.push(line, 'else', alt)
      }

      return group(
        shouldIndent
          ? concat([indent(concat(parts)), softline])
          : concat(parts),
        { shouldBreak }
      )
    }
    case 'WhileStatement': {
      const simpleTest = path.call(print, 'test')
      const breakingTest = group(
        concat([
          ifBreak('('),
          indent(concat([softline, simpleTest])),
          softline,
          ifBreak(')'),
        ])
      )
      const dontBreakTest = n.test.type === 'CallExpression'
      const test = dontBreakTest ? simpleTest : breakingTest
      const guard = n.guard ? concat([' when ', path.call(print, 'guard')]) : ''
      const keyword = n.inverted ? 'until ' : 'while '

      if (n.postfix) {
        parts.push(path.call(print, 'body', 'body', 0), ' ')
        parts.push(keyword, test, guard)
        return concat(parts)
      }

      const shouldBreak = true
      const shouldIndent = !shouldBreak

      const body = adjustClause(n.body, path.call(print, 'body'))

      parts.push(
        concat([
          shouldIndent ? softline : '',
          keyword,
          test,
          guard,
          ifBreak('', ' then'),
          body,
        ])
      )

      return group(
        shouldIndent
          ? concat([indent(concat(parts)), softline])
          : concat(parts),
        { shouldBreak }
      )
    }
    case 'JSXAttribute':
      parts.push(path.call(print, 'name'))

      if (n.value) {
        let res
        if (isStringLiteral(n.value)) {
          const value = rawText(n.value)
          res = '"' + value.slice(1, -1).replace(/"/g, '&quot;') + '"'
        } else {
          res = path.call(print, 'value')
        }
        parts.push('=', res)
      }

      return concat(parts)
    case 'JSXIdentifier':
      return '' + n.name
    case 'JSXSpreadAttribute':
      return concat(['{...', path.call(print, 'argument'), '}'])
    case 'JSXExpressionContainer': {
      const parent = path.getParentNode()

      const shouldInline =
        n.expression.type === 'ArrayExpression' ||
        n.expression.type === 'ObjectExpression' ||
        n.expression.type === 'FunctionExpression' ||
        n.expression.type === 'CallExpression' ||
        (isJSXNode(parent) && (isIf(n.expression) || isBinaryish(n.expression)))

      if (shouldInline) {
        return group(concat(['{', path.call(print, 'expression'), '}']))
      }

      return group(
        concat([
          '{',
          indent(concat([softline, path.call(print, 'expression')])),
          softline,
          '}',
        ])
      )
    }
    case 'JSXElement': {
      const elem = printJSXElement(path, options, print)
      return elem
    }
    case 'JSXOpeningElement': {
      if (
        n.attributes &&
        n.attributes.length === 1 &&
        n.attributes[0].value &&
        isStringLiteral(n.attributes[0].value)
      ) {
        return group(
          concat([
            '<',
            path.call(print, 'name'),
            ' ',
            concat(path.map(print, 'attributes')),
            n.selfClosing ? ' />' : '>',
          ])
        )
      }

      const bracketSameLine = options.jsxBracketSameLine

      return group(
        concat([
          '<',
          path.call(print, 'name'),
          concat([
            indent(
              concat(
                path.map(attr => concat([line, print(attr)]), 'attributes')
              )
            ),
            n.selfClosing ? line : bracketSameLine ? '>' : softline,
          ]),
          n.selfClosing ? '/>' : bracketSameLine ? '' : '>',
        ])
      )
    }
    case 'JSXClosingElement':
      return concat(['</', path.call(print, 'name'), '>'])
    case 'ClassBody':
      if (n.body.length === 0) {
        return ''
      }

      return concat([
        indent(
          concat([
            hardline,
            path.call(bodyPath => {
              return printStatementSequence(bodyPath, options, print)
            }, 'body'),
          ])
        ),
        // hardline,
      ])
    case 'ClassDeclaration':
    case 'ClassExpression':
      parts.push(concat(printClass(path, options, print)))
      return concat(parts)
    case 'TemplateElement':
      return join(literalline, n.value.raw.split(/\r?\n/g))
    case 'TemplateLiteral': {
      const expressions = path.map(print, 'expressions')

      parts.push('"')

      path.each(childPath => {
        const i = childPath.getName()

        parts.push(print(childPath))

        if (i < expressions.length) {
          const printed = expressions[i]

          parts.push(group(concat(['#{', printed, '}'])))
        }
      }, 'quasis')

      parts.push('"')

      return concat(parts)
    }
  }
}

function shouldOmitObjectBraces(path, { stackOffset = 0 } = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  if (node.type === 'ObjectPattern') {
    return false
  }

  const shouldOmitBracesButStillIndent =
    parent.type === 'JSXExpressionContainer' ||
    (parent.type === 'CallExpression' &&
      parent.arguments.length === 1 &&
      callParensOptional(path, { stackOffset: stackOffset + 1 }))
  if (shouldOmitBracesButStillIndent) {
    return { indent: true }
  }
  const shouldOmitBracesButNotIndent =
    parent.type === 'ClassBody' ||
    (parent.type === 'ArrayExpression' && parent.elements.length === 1) ||
    (parent.type === 'AssignmentExpression' &&
      node === parent.right &&
      isBlockLevel(parent, grandparent))
  if (shouldOmitBracesButNotIndent) {
    return { indent: false }
  }
  return false
}

function isIf(node) {
  return node.type === 'IfStatement' || node.type === 'ConditionalExpression'
}

function printObjectMethod(path, options, print) {
  const objMethod = path.getValue()
  const parts = []

  const key = printPropertyKey(path, options, print)

  if (objMethod.computed) {
    parts.push('[', key, ']')
  } else {
    parts.push(key)
  }

  parts.push(
    ': ',
    group(printFunctionParams(path, print, options)),
    objMethod.bound ? '=>' : '->',
    isEmptyBlock(objMethod.body) ? '' : concat([' ', path.call(print, 'body')])
  )

  return concat(parts)
}

function printClass(path, options, print) {
  const n = path.getValue()
  const parts = []

  parts.push('class')

  if (n.id) {
    parts.push(' ', path.call(print, 'id'))
  }

  if (n.superClass) {
    parts.push(' extends ', path.call(print, 'superClass'))
  }

  parts.push(path.call(print, 'body'))

  return parts
}

function isEmptyBlock(node) {
  return node.type === 'BlockStatement' && !node.body.length
}

function printExportDeclaration(path, options, print) {
  const decl = path.getValue()
  const parts = ['export ']

  if (decl['default'] || decl.type === 'ExportDefaultDeclaration') {
    parts.push('default ')
  }

  if (decl.declaration) {
    parts.push(path.call(print, 'declaration'))
  } else {
    if (decl.specifiers && decl.specifiers.length > 0) {
      const specifiers = []
      const defaultSpecifiers = []
      const namespaceSpecifiers = []
      path.each(specifierPath => {
        const specifierType = path.getValue().type
        if (specifierType === 'ExportSpecifier') {
          specifiers.push(print(specifierPath))
        } else if (specifierType === 'ExportDefaultSpecifier') {
          defaultSpecifiers.push(print(specifierPath))
        } else if (specifierType === 'ExportDefaultSpecifier') {
          namespaceSpecifiers.push(concat(['* as ', print(specifierPath)]))
        }
      }, 'specifiers')

      const isNamespaceFollowed =
        namespaceSpecifiers.length !== 0 && specifiers.length !== 0

      const isDefaultFollowed =
        defaultSpecifiers.length !== 0 &&
        (namespaceSpecifiers.length !== 0 || specifiers.length !== 0)

      parts.push(
        concat(defaultSpecifiers),
        concat([isDefaultFollowed ? ', ' : '']),
        concat(namespaceSpecifiers),
        concat([isNamespaceFollowed ? ', ' : '']),
        specifiers.length !== 0
          ? group(
              concat([
                '{',
                indent(
                  concat([
                    options.bracketSpacing ? line : softline,
                    join(concat([ifBreak('', ','), line]), specifiers),
                  ])
                ),
                options.bracketSpacing ? line : softline,
                '}',
              ])
            )
          : ''
      )
    } else {
      parts.push('{}')
    }

    if (decl.source) {
      parts.push(' from ', path.call(print, 'source'))
    }
  }

  return concat(parts)
}

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

function shouldInlineLogicalExpression(node) {
  if (node.type !== 'LogicalExpression') {
    return false
  }

  return false
}

function printJSXElement(path, options, print) {
  const n = path.getValue()

  if (n.type === 'JSXElement' && isEmptyJSXElement(n)) {
    n.openingElement.selfClosing = true
    return path.call(print, 'openingElement')
  }

  const openingLines = path.call(print, 'openingElement')
  const closingLines = path.call(print, 'closingElement')

  n.children = n.children.map(child => {
    if (isJSXWhitespaceExpression(child)) {
      return { type: 'JSXText', value: ' ', raw: ' ' }
    }
    return child
  })

  const containsTag = n.children.filter(isJSXNode).length > 0
  const containsMultipleExpressions =
    n.children.filter(child => child.type === 'JSXExpressionContainer').length >
    1
  const containsMultipleAttributes =
    n.type === 'JSXElement' && n.openingElement.attributes.length > 1

  let forcedBreak =
    willBreak(openingLines) ||
    containsTag ||
    containsMultipleAttributes ||
    containsMultipleExpressions

  const rawJsxWhitespace = options.singleQuote ? "{' '}" : '{" "}'
  const jsxWhitespace = ifBreak(concat([rawJsxWhitespace, softline]), ' ')

  const children = printJSXChildren(path, options, print, jsxWhitespace)

  const containsText =
    n.children.filter(child => isMeaningfulJSXText(child)).length > 0

  for (let i = children.length - 2; i >= 0; i--) {
    const isPairOfEmptyStrings = children[i] === '' && children[i + 1] === ''
    const isPairOfHardlines =
      children[i] === hardline &&
      children[i + 1] === '' &&
      children[i + 2] === hardline
    const isLineFollowedByJSXWhitespace =
      (children[i] === softline || children[i] === hardline) &&
      children[i + 1] === '' &&
      children[i + 2] === jsxWhitespace
    const isJSXWhitespaceFollowedByLine =
      children[i] === jsxWhitespace &&
      children[i + 1] === '' &&
      (children[1 + 2] === softline || children[i + 2] === hardline)
    const isDoubleJSXWhitespace =
      children[i] === jsxWhitespace &&
      children[i + 1] === '' &&
      children[i + 2] === jsxWhitespace

    if (
      (isPairOfHardlines && containsText) ||
      isPairOfEmptyStrings ||
      isLineFollowedByJSXWhitespace ||
      isDoubleJSXWhitespace
    ) {
      children.splice(i, 2)
    } else if (isJSXWhitespaceFollowedByLine) {
      children.splice(i + 1, 2)
    }
  }

  while (
    children.length &&
    (isLineNext(util.getLast(children)) || isEmpty(util.getLast(children)))
  ) {
    children.pop()
  }

  while (
    children.length &&
    (isLineNext(children[0]) || isEmpty(children[0])) &&
    (isLineNext(children[1]) || isEmpty(children[1]))
  ) {
    children.shift()
    children.shift()
  }

  const multilineChildren = []
  children.forEach((child, i) => {
    if (child === jsxWhitespace) {
      if (i === 1 && children[i - 1] === '') {
        if (children.length === 2) {
          multilineChildren.push(rawJsxWhitespace)
          return
        }
        multilineChildren.push(concat([rawJsxWhitespace, hardline]))
        return
      } else if (i === children.length - 1) {
        multilineChildren.push(rawJsxWhitespace)
        return
      } else if (children[i - 1] === '' && children[i - 2] === hardline) {
        multilineChildren.push(rawJsxWhitespace)
        return
      }
    }

    multilineChildren.push(child)

    if (willBreak(child)) {
      forcedBreak = true
    }
  })

  const content = containsText
    ? fill(multilineChildren)
    : group(concat(multilineChildren), { shouldBreak: true })

  const multiLineElem = group(
    concat([
      openingLines,
      indent(concat([hardline, content])),
      hardline,
      closingLines,
    ])
  )

  if (forcedBreak) {
    return multiLineElem
  }

  return conditionalGroup([
    group(concat([openingLines, concat(children), closingLines])),
    multiLineElem,
  ])
}

function isJSXWhitespaceExpression(node) {
  return (
    node.type === 'JSXExpressionContainer' &&
    isLiteral(node.expression) &&
    node.expression.value === ' '
  )
}

function printJSXChildren(path, options, print, jsxWhitespace) {
  const n = path.getValue()
  const children = []

  path.map((childPath, i) => {
    const child = childPath.getValue()
    if (isLiteral(child)) {
      const text = rawText(child)

      if (isMeaningfulJSXText(child)) {
        const words = text.split(matchJsxWhitespaceRegex)

        if (words[0] === '') {
          children.push('')
          words.shift()
          if (/\n/.test(words[0])) {
            children.push(hardline)
          } else {
            children.push(jsxWhitespace)
          }
          words.shift()
        }

        let endWhitespace
        if (util.getLast(words) === '') {
          words.pop()
          endWhitespace = words.pop()
        }

        if (words.length === 0) {
          return
        }

        words.forEach((word, i) => {
          if (i % 2 === 1) {
            children.push(line)
          } else {
            children.push(word)
          }
        })

        if (endWhitespace !== undefined) {
          if (/\n/.test(endWhitespace)) {
            children.push(hardline)
          } else {
            children.push(jsxWhitespace)
          }
        } else {
          children.push('')
        }
      } else if (/\n/.test(text)) {
        if (text.match(/\n/g).length > 1) {
          children.push('')
          children.push(hardline)
        }
      } else {
        children.push('')
        children.push(jsxWhitespace)
      }
    } else {
      const printedChild = print(childPath)
      children.push(printedChild)

      const next = n.children[i + 1]
      const directlyFollowedByMeaningfulText =
        next && isMeaningfulJSXText(next) && !/^[ \n\r\t]/.test(rawText(next))
      if (directlyFollowedByMeaningfulText) {
        children.push('')
      } else {
        children.push(hardline)
      }
    }
  }, 'children')

  return children
}

const jsxWhitespaceChars = ' \n\r\t'
const containsNonJsxWhitespaceRegex = new RegExp(
  '[^' + jsxWhitespaceChars + ']'
)
const matchJsxWhitespaceRegex = new RegExp('([' + jsxWhitespaceChars + ']+)')

function isMeaningfulJSXText(node) {
  return (
    isLiteral(node) &&
    (containsNonJsxWhitespaceRegex.test(rawText(node)) ||
      !/\n/.test(rawText(node)))
  )
}

function isLiteral(node) {
  return (
    node.type === 'BooleanLiteral' ||
    node.type === 'NullLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'RegExpLiteral' ||
    node.type === 'StringLiteral' ||
    node.type === 'TemplateLiteral' ||
    node.type === 'JSXText'
  )
}

function isJSXNode(node) {
  return node.type === 'JSXElement'
}

function isEmptyJSXElement(node) {
  return node.children.length === 0
}

function adjustClause(node, clause) {
  if (node.type === 'BlockStatement') {
    return clause
  }

  return indent(concat([line, clause]))
}

function isLogicalNotExpression(node) {
  return node.operator === '!'
}

function isMemberish(node) {
  return node.type === 'MemberExpression'
}

function printMemberChain(path, options, print) {
  const printedNodes = []

  function rec(path) {
    const node = path.getValue()

    if (
      node.type === 'CallExpression' &&
      (isMemberish(node.callee) || node.callee.type === 'CallExpression')
    ) {
      printedNodes.unshift({
        node,
        printed: concat([
          printOptionalToken(path),
          printArgumentsList(path, options, print),
        ]),
      })
      path.call(callee => rec(callee), 'callee')
    } else if (isMemberish(node)) {
      printedNodes.unshift({
        node,
        printed: printMemberLookup(path, options, print),
      })
      path.call(object => rec(object), 'object')
    } else {
      printedNodes.unshift({
        node,
        printed: path.call(print),
      })
    }
  }

  const node = path.getValue()
  printedNodes.unshift({
    node,
    printed: concat([
      printOptionalToken(path),
      printArgumentsList(path, options, print),
    ]),
  })
  path.call(callee => rec(callee), 'callee')

  const groups = []
  let currentGroup = [printedNodes[0]]
  let i = 1
  for (; i < printedNodes.length; ++i) {
    const printedNode = printedNodes[i]
    const { node } = printedNode
    if (
      node.type === 'CallExpression' ||
      (node.type === 'MemberExpression' &&
        node.computed &&
        isNumericLiteral(node.property))
    ) {
      currentGroup.push(printedNode)
    } else {
      break
    }
  }
  if (printedNodes[0].node.type !== 'CallExpression') {
    for (; i + 1 < printedNodes.length; ++i) {
      if (
        isMemberish(printedNodes[i].node) &&
        isMemberish(printedNodes[i + 1].node)
      ) {
        currentGroup.push(printedNodes[i])
      } else {
        break
      }
    }
  }
  groups.push(currentGroup)
  currentGroup = []

  let hasSeenCallExpression = false
  for (; i < printedNodes.length; ++i) {
    const printedNode = printedNodes[i]
    const { node } = printedNode
    if (hasSeenCallExpression && isMemberish(node)) {
      if (node.computed) {
        currentGroup.push(printedNode)
        continue
      }

      groups.push(currentGroup)
      currentGroup = []
      hasSeenCallExpression = false
    }

    if (node.type === 'CallExpression') {
      hasSeenCallExpression = true
    }
    currentGroup.push(printedNode)
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  // function isFactory(name) {
  //   return name.match(/(^[A-Z])|^[_$]+$/)
  // }

  function printGroup(printedGroup) {
    return concat(printedGroup.map(tuple => tuple.printed))
  }

  function printIndentedGroup(groups) {
    if (groups.length === 0) {
      return ''
    }
    return indent(
      group(concat([hardline, join(hardline, groups.map(printGroup))]))
    )
  }

  const printedGroups = groups.map(printGroup)
  const oneLine = concat(printedGroups)

  const cutoff = 2
  // const flatGroups = groups
  //   .slice(0, cutoff)
  //   .reduce((res, group) => res.concat(group), [])

  if (groups.length <= cutoff) {
    return group(oneLine)
  }

  const expanded = concat([
    printGroup(groups[0]),
    printIndentedGroup(groups.slice(1)),
  ])

  const callExpressionCount = printedNodes.filter(
    tuple => tuple.node.type === 'CallExpression'
  ).length

  if (callExpressionCount >= 3 || printedGroups.slice(0, -1).some(willBreak)) {
    return group(expanded)
  }

  return concat([
    willBreak(oneLine) ? breakParent : '',
    conditionalGroup([oneLine, expanded]),
  ])
}

function isNumericLiteral(node) {
  return node.type === 'NumericLiteral'
}

const operatorAliasMap = {
  '||': 'or',
  '&&': 'and',
  '===': 'is',
}
function getCanonicalOperator(operator) {
  return operatorAliasMap[operator] || operator
}

function isBinaryish(node) {
  return node.type === 'BinaryExpression' || node.type === 'LogicalExpression'
}

// function printBinaryishExpressions(path, print, options, isNested) {
function printBinaryishExpressions(path, print) {
  let parts = []
  const node = path.getValue()

  let flattenedBreaks = false
  let canBreak = false
  if (isBinaryish(node)) {
    if (shouldFlatten(node.operator, node.left.operator)) {
      parts = parts.concat(
        path.call(left => {
          const { parts: flattenedParts, breaks } = printBinaryishExpressions(
            left,
            print
          )
          if (breaks) {
            flattenedBreaks = true
          }
          return flattenedParts
        }, 'left')
      )
    } else {
      parts.push(path.call(print, 'left'))
    }

    let { operator } = node
    operator = getCanonicalOperator(operator)

    canBreak =
      (operator === 'and' || operator === 'or' || operator === '?') &&
      !isIf(node.right)
    const right = concat([
      operator,
      canBreak ? line : ' ',
      path.call(print, 'right'),
    ])

    parts.push(' ', right)
  } else {
    parts.push(path.call(print))
  }

  return { parts, breaks: canBreak || flattenedBreaks }
}

function isBlockLevel(node, parent) {
  return (
    parent.type === 'ExpressionStatement' || parent.type === 'BlockStatement'
  )
}

function callParensOptional(path, { stackOffset = 0 } = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)

  return (
    isBlockLevel(node, parent) ||
    (parent.type === 'AssignmentExpression' &&
      isBlockLevel(parent, grandparent)) ||
    parent.type === 'JSXExpressionContainer' ||
    (parent.type === 'ObjectProperty' &&
      node === parent.value &&
      shouldOmitObjectBraces(path, { stackOffset: stackOffset + 2 }))
  )
}

function printArgumentsList(path, options, print) {
  const node = path.getValue()
  const args = node.arguments

  if (args.length === 0) {
    return concat(['(', ')'])
  }

  const lastArgIndex = args.length - 1
  const printedArguments = path.map((argPath, index) => {
    // const arg = argPath.getNode()
    const parts = [print(argPath)]

    if (index === lastArgIndex) {
      // do nothing
    } else {
      parts.push(ifBreak('', ','), line)
    }

    return concat(parts)
  }, 'arguments')

  const parent = path.getParentNode()
  const parensOptional =
    node.arguments.length &&
    (callParensOptional(path) ||
      (parent.type === 'CallExpression' &&
        node === parent.arguments[parent.arguments.length - 1] &&
        callParensOptional(path, { stackOffset: 1 })) ||
      (isBinaryish(parent) &&
        node === parent.right &&
        callParensOptional(path, { stackOffset: 1 })))

  const shouldntBreak =
    args.length === 1 && args[0].type === 'FunctionExpression'
  const parensUnnecessary = shouldntBreak

  const openingParen = parensUnnecessary
    ? ' '
    : parensOptional ? ifBreak('(', ' ') : '('
  const closingParen = parensUnnecessary
    ? ''
    : parensOptional ? ifBreak(')') : ')'

  return shouldntBreak
    ? concat([
        openingParen,
        concat(printedArguments),
        parensUnnecessary ? '' : softline,
        closingParen,
      ])
    : group(
        concat([
          openingParen,
          indent(concat([softline, concat(printedArguments)])),
          softline,
          closingParen,
        ])
      )
}

// function isTestCall(n, parent) {
function isTestCall(n) {
  const unitTestRe = /^test$/

  if (n.arguments.length === 2) {
    if (
      n.callee.type === 'Identifier' &&
      unitTestRe.test(n.callee.name) &&
      isStringLiteral(n.arguments[0])
    ) {
      return (
        isFunction(n.arguments[1].type) && n.arguments[1].params.length <= 1
      )
    }
  }
  return false
}

function isFunction(type) {
  return type === 'FunctionExpression'
}

function isStringLiteral(node) {
  return node.type === 'StringLiteral'
}

function printAssignmentRight(rightNode, printedRight, options, canBreak) {
  if (canBreak) {
    return indent(concat([line, printedRight]))
  }

  return concat([' ', printedRight])
}

function printAssignment(
  leftNode,
  printedLeft,
  operator,
  rightNode,
  printedRight,
  options
) {
  const dontBreak =
    !(
      leftNode.type === 'Identifier' ||
      isStringLiteral(leftNode) ||
      leftNode.type === 'MemberExpression'
    ) ||
    rightNode.type === 'ArrayExpression' ||
    rightNode.type === 'FunctionExpression' ||
    rightNode.type === 'NewExpression'

  const printed = printAssignmentRight(
    rightNode,
    printedRight,
    options,
    !dontBreak
  )

  return group(concat([printedLeft, operator, printed]))
}

function printFunctionParams(path, print) {
  const fun = path.getValue()

  if (!(fun.params && fun.params.length)) {
    return concat([]) // TODO: is this the right way to return "empty"?
  }

  const printed = path.map(print, 'params')

  return concat([
    '(',
    indent(concat([softline, join(concat([ifBreak('', ','), line]), printed)])),
    softline,
    ') ',
  ])
}

function printOptionalToken(path) {
  const node = path.getValue()
  if (!node.optional) {
    return ''
  }
  return '?'
}

function isThisLookup(node) {
  return (
    node.type === 'MemberExpression' && node.object.type === 'ThisExpression'
  )
}

function isPrototypeLookup(node) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'prototype'
  )
}

function printMemberLookup(path, options, print) {
  const n = path.getValue()
  const parts = []

  const optional = printOptionalToken(path)
  parts.push(optional)

  if (n.computed) {
    parts.push('[')
    const property = path.call(print, 'property')
    parts.push(property)
    parts.push(']')
    return concat(parts)
  }

  if (isPrototypeLookup(n)) {
    parts.push('::')
  } else {
    const precededByPrototype = isPrototypeLookup(n.object)
    if (!((precededByPrototype || isThisLookup(n)) && !optional)) {
      parts.push('.')
    }
    const property = path.call(print, 'property')
    parts.push(property)
  }

  return concat(parts)
}

function printStatementSequence(path, options, print) {
  const printed = []

  // const bodyNode = path.getNode()
  const text = options.originalText

  path.map(stmtPath => {
    const stmt = stmtPath.getValue()

    if (!stmt) {
      return
    }

    const stmtPrinted = print(stmtPath)
    const parts = []

    parts.push(stmtPrinted)

    if (
      util.isNextLineEmpty(text, stmt, locEnd) &&
      !isLastStatement(stmtPath)
    ) {
      parts.push(hardline)
    }

    printed.push(concat(parts))
  })

  return join(hardline, printed)
}

function isLastStatement(path) {
  const parent = path.getParentNode()
  if (!parent) {
    return true
  }
  const node = path.getValue()
  const body = parent.body || parent.consequent
  return body && body[body.length - 1] === node
}

function printPropertyKey(path, options, print) {
  const node = path.getValue()
  const { key } = node

  if (isStringLiteral(key) && isIdentifierName(key.value) && !node.computed) {
    return key.value
  }
  return path.call(print, 'key')
}

function isIdentifierName(str) {
  return IDENTIFIER.test(str)
}

function printArrayItems(path, options, printPath, print) {
  const printedElements = []
  let separatorParts = []

  path.each(childPath => {
    printedElements.push(concat(separatorParts))
    printedElements.push(print(childPath))

    separatorParts = [ifBreak('', ','), line]
  }, printPath)

  return concat(printedElements)
}

function nodeStr(node, options) {
  const raw = rawText(node)
  return util.printString(raw, options)
}

const PRECEDENCE = {}
;[['?'], ['or'], ['and'], ['is']].forEach((tier, i) => {
  tier.forEach(op => {
    PRECEDENCE[op] = i
  })
})

function getPrecedence(op) {
  return PRECEDENCE[op]
}

function shouldFlatten(parentOp, nodeOp) {
  parentOp = getCanonicalOperator(parentOp)
  nodeOp = getCanonicalOperator(nodeOp)
  // console.log({
  //   parentOp,
  //   nodeOp,
  //   parentPrec: getPrecedence(parentOp),
  //   nodePrec: getPrecedence(nodeOp),
  // })
  if (getPrecedence(nodeOp) !== getPrecedence(parentOp)) {
    return false
  }

  return true
}

// const clean = (ast, newObj) => {}
const clean = () => {}

module.exports = {
  print: genericPrint,
  embed,
  massageAstNode: clean,
}

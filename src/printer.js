'use strict'

const privateUtil = require('prettier/src/common/util')
const embed = require('./embed')
const { IDENTIFIER } = require('coffeescript/lib/coffeescript/lexer')

const { doc } = require('prettier')
const docBuilders = doc.builders
const {
  breakParent,
  concat,
  conditionalGroup,
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
const { isEmpty, rawText, willBreak } = docUtils

const util = require('util')

function isStatement(node) {
  return (
    node.type === 'BlockStatement' ||
    node.type === 'ExpressionStatement' ||
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

          if (po === 'or' && no === 'and') {
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
      }
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
  return console.log(util.inspect(obj, { depth: 30 }))
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

  const parts = []
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
      const isInsideParenthesis =
        n !== parent.body &&
        (parent.type === 'IfStatement' ||
          parent.type === 'ConditionalExpression')

      const parts = printBinaryishExpressions(path, print, options, false)

      if (isInsideParenthesis) {
        return concat(parts)
      }

      // if (shouldInlineLogicalExpression(n) && !samePrecedenceSubExpression)
      // return group(concat(parts))

      const rest = concat(parts.slice(1))

      return group(concat([parts.length > 0 ? parts[0] : '', indent(rest)]))
    }
    case 'AssignmentPattern':
      return concat([
        path.call(print, 'left'),
        ' = ',
        path.call(print, 'right'),
      ])
    case 'ObjectExpression':
    case 'ObjectPattern': {
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
        return result
      })

      if (joinedProps.length === 0) {
        return concat(['{', '}'])
      }
      const content = concat([
        '{',
        indent(
          concat([
            options.bracketSpacing ? line : softline,
            concat(joinedProps),
          ])
        ),
        concat([options.bracketSpacing ? line : softline, '}']),
      ])

      return group(content)
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
    case 'RestElement':
      return concat([path.call(print, 'argument'), '...'])
    case 'FunctionExpression': {
      parts.push(group(printFunctionParams(path, print, options)))

      parts.push(n.bound ? '=>' : '->')

      const body = path.call(bodyPath => print(bodyPath), 'body')

      return group(concat([concat(parts), ' ', body]))
    }
    case 'BlockStatement': {
      const naked = path.call(bodyPath => {
        return printStatementSequence(bodyPath, options, print)
      }, 'body')

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
        parts.push(' ', path.call(print, 'argument'))
      }

      return concat(parts)
    case 'NewExpression':
    case 'CallExpression': {
      const isNew = n.type === 'NewExpression'

      if (isTestCall(n, path.getParentNode())) {
        return concat([
          path.call(print, 'callee'),
          concat([' ', join(', ', path.map(print, 'arguments'))]),
        ])
      }

      if (!isNew && isMemberish(n.callee)) {
        return printMemberChain(path, options, print)
      }

      return concat([
        isNew ? 'new ' : '',
        path.call(print, 'callee'),
        printArgumentsList(path, options, print),
      ])
    }
    case 'NumericLiteral':
      return privateUtil.printNumber(n.extra.raw)
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
    case 'UpdateExpression':
      parts.push(path.call(print, 'argument'), n.operator)

      if (n.prefix) {
        parts.reverse()
      }

      return concat(parts)
    case 'ConditionalExpression':
    case 'IfStatement': {
      // const isStatement = n.type === 'IfStatement'
      // const shouldBreak = isStatement
      const shouldBreak = !pathNeedsParens(path)
      const shouldIndent = !shouldBreak

      const con = adjustClause(n.consequent, path.call(print, 'consequent'))

      const opening = concat([
        shouldIndent ? softline : '',
        'if ',
        group(
          concat([
            ifBreak('('),
            indent(concat([softline, path.call(print, 'test')])),
            softline,
            ifBreak(')'),
          ])
        ),
        ifBreak('', ' then'),
        con,
      ])
      parts.push(opening)

      if (n.alternate) {
        const alt = adjustClause(n.alternate, path.call(print, 'alternate'))
        parts.push(line, 'else', alt)
      }

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
    case 'JSXExpressionContainer': {
      // const parent = path.getParentNode()

      return group(concat(['{', path.call(print, 'expression'), '}']))
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

// function shouldInlineLogicalExpression(node) {
//   if (node.type !== 'LogicalExpression') {
//     return false
//   }

//   return false
// }

function printJSXElement(path, options, print) {
  // const n = path.getValue()

  return path.call(print, 'openingElement')
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
        printed: concat([printArgumentsList(path, options, print)]),
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
    printed: concat([printArgumentsList(path, options, print)]),
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

  if (isBinaryish(node)) {
    if (shouldFlatten(node.operator, node.left.operator)) {
      parts = parts.concat(
        path.call(left => printBinaryishExpressions(left, print), 'left')
      )
    } else {
      parts.push(path.call(print, 'left'))
    }

    let { operator } = node
    operator = getCanonicalOperator(operator)

    const canBreak = operator === 'and' || operator === 'or'
    const right = concat([
      operator,
      canBreak ? line : ' ',
      path.call(print, 'right'),
    ])

    parts.push(' ', right)
  } else {
    parts.push(path.call(print))
  }

  return parts
}

function isBlockLevel(node, parent) {
  return parent.type === 'ExpressionStatement'
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
  const grandparent = path.getParentNode(1)
  const parensOptional =
    args.length &&
    (isBlockLevel(node, parent) ||
      (parent.type === 'AssignmentExpression' &&
        isBlockLevel(parent, grandparent)))

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

  path.map(stmtPath => {
    const stmt = stmtPath.getValue()

    if (!stmt) {
      return
    }

    const stmtPrinted = print(stmtPath)
    const parts = []

    parts.push(stmtPrinted)

    printed.push(concat(parts))
  })

  return join(hardline, printed)
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
  return privateUtil.printString(raw, options)
}

const PRECEDENCE = {}
;[['or'], ['and'], ['is']].forEach((tier, i) => {
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

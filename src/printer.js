'use strict'

const privateUtil = require('prettier/src/common/util')
const embed = require('./embed')

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
  line,
  softline,
} = docBuilders
const docUtils = doc.utils
const { willBreak } = docUtils

const util = require('util') // eslint-disable-line no-unused-vars

function genericPrint(path, options, print) {
  // return console.log(util.inspect(path, { depth: 10 }))
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
      const parts = printBinaryishExpressions(path, print, options, false)
      return concat(parts)
    }
    case 'ArrayExpression':
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
    case 'Identifier':
      return concat([n.name])
    case 'MemberExpression': {
      const shouldInline = n.computed

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
    case 'CallExpression':
      if (isTestCall(n, path.getParentNode())) {
        return concat([
          path.call(print, 'callee'),
          concat([' ', join(', ', path.map(print, 'arguments'))]),
        ])
      }

      if (isMemberish(n.callee)) {
        return printMemberChain(path, options, print)
      }

      return concat([
        path.call(print, 'callee'),
        printArgumentsList(path, options, print),
      ])
    case 'NumericLiteral':
      return privateUtil.printNumber(n.extra.raw)
    case 'StringLiteral':
      return nodeStr(n, options)
    case 'UnaryExpression':
      parts.push(n.operator)

      parts.push(path.call(print, 'argument'))

      return concat(parts)
  }
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

// function printBinaryishExpressions(path, print, options, isNested) {
function printBinaryishExpressions(path, print) {
  const parts = []
  const node = path.getValue()

  parts.push(path.call(print, 'left'))

  const right = concat([node.operator, ' ', path.call(print, 'right')])

  parts.push(' ', right)

  return parts
}

function isBlockLevel(path) {
  const parent = path.getParentNode()
  return parent.type === 'ExpressionStatement'
}

function printArgumentsList(path, options, print) {
  const args = path.getValue().arguments

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

  const parensOptional = isBlockLevel(path)

  return group(
    concat([
      parensOptional ? ifBreak('(', ' ') : '(',
      indent(concat([softline, concat(printedArguments)])),
      softline,
      parensOptional ? ifBreak(')') : ')',
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
  const dontBreak = rightNode.type === 'ArrayExpression'

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
    if (!precededByPrototype) {
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

function rawText(node) {
  return node.extra ? node.extra.raw : node.raw
}

// const clean = (ast, newObj) => {}
const clean = () => {}

module.exports = {
  print: genericPrint,
  embed,
  massageAstNode: clean,
}

'use strict'

const util = require('prettier/src/common/util')
const embed = require('./embed')
const {IDENTIFIER} = require('coffeescript/lib/coffeescript/lexer')

const {doc} = require('prettier')
const docBuilders = doc.builders
const {
  // addAlignmentToDoc,
  breakParent,
  concat,
  conditionalGroup,
  dedent,
  fill,
  group,
  hardline,
  ifBreak,
  ifVisibleGroupBroke,
  indent,
  join,
  literalline,
  line,
  softline,
} = docBuilders
const docUtils = doc.utils
const {isEmpty, isLineNext, willBreak} = docUtils

const sysUtil = require('util')

function isStatement(node) {
  return (
    node.type === 'BlockStatement' ||
    node.type === 'ExpressionStatement' ||
    // node.type === 'WhileStatement' ||
    node.type === 'IfStatement'
  )
}

function pathNeedsParens(path, {stackOffset = 0} = {}) {
  const parent = path.getParentNode(stackOffset)
  if (!parent) {
    return false
  }

  const node = path.getParentNode(stackOffset - 1)

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
        firstParentNotMemberExpression = path.getParentNode(++i + stackOffset)
      }

      if (
        firstParentNotMemberExpression.type === 'NewExpression' &&
        firstParentNotMemberExpression.callee ===
          path.getParentNode(i - 1 + stackOffset)
      ) {
        return true
      }
      switch (parent.type) {
        case 'Range':
          return node.arguments && node.arguments.length > 0
        default:
          return false
      }
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
          return parent.object === node

        case 'TaggedTemplateExpression':
          return true
        case 'NewExpression':
        case 'CallExpression':
          return parent.callee === node

        case 'BinaryExpression':
          if (node.operator === 'do') {
            return true
          }
          return parent.operator === '**' && parent.left === node

        default:
          return false
      }
    case 'BinaryExpression':
    case 'LogicalExpression':
      switch (parent.type) {
        case 'CallExpression':
        case 'NewExpression':
          return parent.callee === node

        case 'TaggedTemplateExpression':
        case 'UnaryExpression':
        case 'Existence':
        case 'Range':
          return true
        case 'BinaryExpression':
        case 'LogicalExpression': {
          const po = getCanonicalOperator(parent)
          const pp = getPrecedence(po)
          const no = getCanonicalOperator(node)
          const np = getPrecedence(no)

          if (pp > np) {
            return true
          }

          if ((po === '||' || po === 'BIN?') && no === '&&') {
            return true
          }

          if (pp === np && parent.right === node) {
            return true
          }

          if (pp === np && !shouldFlatten(parent, node)) {
            return true
          }

          return false
        }
        default:
          return false
      }
    case 'SequenceExpression':
      switch (parent.type) {
        default:
          return true
      }
    case 'YieldExpression':
    // else fallthrough
    case 'AwaitExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
          return true
        default:
          return false
      }
    case 'StringLiteral':
    case 'TemplateLiteral':
    case 'NumericLiteral':
      return (
        (parent.type === 'TaggedTemplateExpression' && node === parent.tag) ||
        (parent.type === 'CallExpression' && node === parent.callee)
      )
    case 'AssignmentExpression':
      if (
        parent.type === 'ExpressionStatement' ||
        parent.type === 'AssignmentExpression' ||
        (parent.type === 'ConditionalExpression' &&
          parent.postfix &&
          node === parent.consequent)
      ) {
        return false
      }
      if (
        node.operator !== '=' &&
        ((parent.type === 'CallExpression' && node !== parent.callee) ||
          (parent.type === 'WhileStatement' && node === parent.test))
      ) {
        return false
      }
      return true
    case 'ConditionalExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
        case 'Range':
        case 'ReturnStatement':
        case 'ThrowStatement':
        case 'Existence':
        case 'MemberExpression':
          return true

        case 'NewExpression':
        case 'CallExpression':
          return parent.callee === node || node.postfix
        case 'BinaryExpression':
        case 'LogicalExpression':
          return true
        // return parent.right === node
        case 'JSXSpreadAttribute':
          return true
        default:
          return false
      }
    case 'For':
      switch (parent.type) {
        case 'CallExpression':
          return parent.callee === node || node.postfix
        case 'AssignmentExpression':
          return node.postfix
        case 'ReturnStatement':
        case 'MemberExpression':
        case 'SpreadElement':
          return true
        default:
          return false
      }
    case 'WhileStatement':
      switch (parent.type) {
        case 'AssignmentExpression':
          return node.postfix
        default:
          return false
      }
    case 'FunctionExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
        case 'MemberExpression':
          return true
        case 'CallExpression':
          return (
            !parent.arguments ||
            node !== parent.arguments[parent.arguments.length - 1]
          )
        case 'For':
          return parent.postfix && node === parent.body
        default:
          return false
      }
    case 'ClassExpression':
      return (
        parent.type === 'ExportDefaultDeclaration' ||
        parent.type === 'TaggedTemplateExpression' ||
        (parent.type === 'BinaryExpression' &&
          parent.left === node &&
          node.superClass) ||
        (parent.type === 'CallExpression' && parent.callee === node) ||
        (parent.type === 'MemberExpression' && parent.object === node) ||
        (isIf(parent) && parent.test === node)
      )
    case 'ObjectExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
          return true
        default:
          return false
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
  return console.log(sysUtil.inspect(obj, {depth: 40}))
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

      const {parts, breaks} = printBinaryishExpressions(
        path,
        print,
        options,
        false
      )

      if (isInsideParenthesis) {
        return concat(parts)
      }

      const shouldNotIndent =
        parent.type === 'ReturnStatement' ||
        (parent.type === 'JSXExpressionContainer' &&
          parentParent.type === 'JSXAttribute') ||
        isOnlyExpressionInFunctionBody(path)
      const shouldIndentIfInlining =
        parent.type === 'AssignmentExpression' ||
        parent.type === 'ObjectProperty'

      const samePrecedenceSubExpression =
        isBinaryish(n.left) && shouldFlatten(n, n.left)

      if (
        shouldNotIndent ||
        (shouldInlineLogicalExpression(n, {notJSX: true}) &&
          !samePrecedenceSubExpression) ||
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
      const grandparent = path.getParentNode(1)
      const printedProps = []
      path.each(childPath => {
        const node = childPath.getValue()
        printedProps.push({
          node,
          printed: print(childPath),
        })
      }, 'properties')
      let separatorParts = []
      const joinedProps = printedProps.map(prop => {
        const result = concat(separatorParts.concat(group(prop.printed)))
        separatorParts = [ifBreak('', ','), line]
        if (util.isNextLineEmpty(options.originalText, prop.node, locEnd)) {
          separatorParts.push(hardline)
        }
        return result
      })

      if (joinedProps.length === 0) {
        return concat(['{', '}'])
      }

      const shouldOmitBraces = shouldOmitObjectBraces(path)
      const shouldOmitBracesIfParentBreaks =
        !shouldOmitBraces &&
        shouldOmitObjectBraces(path, {ifParentBreaks: true})
      let dontIndent = false
      let trailingLine = true
      if (shouldOmitBraces && !shouldOmitBraces.indent) {
        dontIndent = true
      }
      if (shouldOmitBraces && shouldOmitBraces.trailingLine === false) {
        trailingLine = false
      }
      const isClassBody =
        parent.type === 'ExpressionStatement' &&
        grandparent.type === 'ClassBody'
      const props = n.properties
      const isNestedObject =
        n.type === 'ObjectExpression' &&
        props.length > 1 &&
        parent.type === 'ObjectProperty' &&
        n === parent.value
      const isCallArg =
        props.length > 1 &&
        parent.type === 'CallExpression' &&
        n !== parent.callee
      const isNonTrailingCallArg =
        isCallArg &&
        n !== parent.arguments[parent.arguments.length - 1] &&
        !(
          parent.arguments.length >= 2 &&
          n === parent.arguments[parent.arguments.length - 2] &&
          parent.arguments[parent.arguments.length - 1].type ===
            'FunctionExpression'
        )
      const shouldBreak =
        isClassBody || // || (shouldOmitBraces && n.properties.length > 1)
        isNestedObject ||
        isNonTrailingCallArg ||
        (props.length > 1 &&
          props.find(
            ({value}) =>
              value &&
              value.type === 'ObjectExpression' &&
              value.properties.length >= 1
          ))
      const shouldBreakIfParentBreaks = isCallArg
      if (shouldOmitBraces && (isClassBody || isNestedObject)) {
        dontIndent = true
      }
      if (
        shouldOmitBracesIfParentBreaks &&
        shouldOmitBracesIfParentBreaks.indent === false
      ) {
        dontIndent = true
      }
      const content = concat([
        // shouldBreakIfParentBreaks
        //   ? ifVisibleGroupBroke(breakParent, '', {count: 1})
        //   : '',
        shouldOmitBracesIfParentBreaks
          ? ifVisibleGroupBroke('', '{', {count: 1})
          : shouldOmitBraces
            ? ''
            : '{',
        dontIndent
          ? concat(joinedProps)
          : indent(
              concat([
                shouldOmitBraces || !options.bracketSpacing
                  ? softline
                  : shouldOmitBracesIfParentBreaks
                    ? ifVisibleGroupBroke('', softline, {count: 1})
                    : line,
                concat(joinedProps),
              ])
            ),
        concat([
          dontIndent || !trailingLine
            ? ''
            : shouldOmitBraces || !options.bracketSpacing
              ? softline
              : shouldOmitBracesIfParentBreaks
                ? ifVisibleGroupBroke('', softline, {count: 1})
                : line,
          shouldOmitBracesIfParentBreaks
            ? ifVisibleGroupBroke('', '}', {count: 1})
            : shouldOmitBraces
              ? ''
              : '}',
        ]),
      ])
      return group(content, {
        shouldBreak,
        visible: true,
        shouldBreakIfVisibleGroupBroke: shouldBreakIfParentBreaks,
      })
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
    case 'ArrayPattern': {
      if (n.elements.length === 0) {
        return '[]'
      }

      const lastElem = util.getLast(n.elements)
      const needsForcedTrailingComma = lastElem === null

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
            needsForcedTrailingComma ? ',' : '',
            softline,
            ']',
          ]),
          {visible: true}
        )
      )
      return concat(parts)
    }
    case 'SequenceExpression':
      return group(
        concat([join(concat([';', line]), path.map(print, 'expressions'))])
      )
    case 'ThisExpression':
      return n.shorthand ? '@' : 'this'
    case 'Super':
      return 'super'
    case 'NullLiteral':
      return 'null'
    case 'RegExpLiteral':
      return printRegex(n)
    case 'PassthroughLiteral': {
      const quote = n.here ? '```' : '`'
      parts.push(quote, n.value, quote)
      return concat(parts)
    }
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
      return concat([n.argument ? path.call(print, 'argument') : '', '...'])
    case 'FunctionExpression': {
      const parent = path.getParentNode()
      parts.push(group(printFunctionParams(path, print, options)))

      parts.push(n.bound ? '=>' : '->')

      const {expr: singleExpr, path: singleExprPath} = singleExpressionBlock(
        n.body,
        {withPath: true}
      )
      const body = isEmptyBlock(n.body)
        ? ''
        : singleExpr &&
          (singleExpr.type === 'TaggedTemplateExpression' ||
            singleExpr.type === 'TemplateLiteral')
          ? concat([' ', path.call(print, 'body', ...singleExprPath)])
          : concat([ifBreak('', ' '), path.call(print, 'body')])

      const shouldBreak =
        singleExpr && (isDo(parent) || isIf(singleExpr, {postfix: true}))
      // singleExpr.type === 'FunctionExpression' ||
      // grandparent.type === 'For'
      return group(
        concat([concat(parts), body, pathNeedsParens(path) ? softline : '']),
        {shouldBreak}
      )
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
        (((parent.type === 'IfStatement' ||
          parent.type === 'ConditionalExpression') &&
          n === parent.consequent &&
          !parent.alternate) ||
          (parent.type === 'WhileStatement' && n === parent.body))
      ) {
        return indent(concat([hardline, ';']))
      }

      if (
        !hasContent &&
        (((parent.type === 'IfStatement' ||
          parent.type === 'ConditionalExpression') &&
          (n === parent.alternate || n === parent.consequent)) ||
          (parent.type === 'TryStatement' &&
            (n === parent.block || n === parent.finalizer)) ||
          (parent.type === 'CatchClause' && n === parent.body))
      ) {
        return ''
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
        const shouldBreak =
          n.argument.type === 'JSXElement' || isBinaryish(n.argument)
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

      if (
        (n.arguments.length === 1 &&
          isTemplateOnItsOwnLine(n.arguments[0], options.originalText)) ||
        (!isNew && isTestCall(n))
      ) {
        return concat([
          isNew ? 'new ' : '',
          path.call(print, 'callee'),
          optional,
          concat([' ', join(', ', path.map(print, 'arguments'))]),
        ])
      }

      if (isChainableCall(n)) {
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
    case 'BooleanLiteral':
      if (n.name) {
        return n.name
      }
    // else fallthrough
    case 'StringLiteral':
      if (typeof n.value !== 'string') {
        return '' + n.value
      }
      return nodeStr(n, options)
    case 'UnaryExpression': {
      const {operator} = n
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
      const dontBreakTest =
        n.test.type === 'CallExpression' || (isDoFunc(n.test) && n.postfix)
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
        {shouldBreak}
      )
    }
    case 'For': {
      const opening = concat([
        'for ',
        n.own ? 'own ' : '',
        n.name || n.index
          ? concat([
              n.style === 'of'
                ? concat([
                    n.index ? path.call(print, 'index') : '',
                    n.name && n.index ? ', ' : '',
                    n.name ? path.call(print, 'name') : '',
                  ])
                : concat([
                    n.name ? path.call(print, 'name') : '',
                    n.name && n.index ? ', ' : '',
                    n.index ? path.call(print, 'index') : '',
                  ]),
              ' ',
              n.style,
              ' ',
            ])
          : '',
        path.call(print, 'source'),
        n.step ? concat([' by ', path.call(print, 'step')]) : '',
        n.guard ? concat([' when ', path.call(print, 'guard')]) : '',
      ])

      if (n.postfix) {
        parts.push(path.call(print, 'body'), ' ')
        parts.push(opening)
        return concat(parts)
      }
      parts.push(opening)

      const {expr: singleExpr, path: singleExprPath} = singleExpressionBlock(
        n.body,
        {withPath: true}
      )
      const shouldBreak = !(singleExpr && isDoFunc(singleExpr))
      const body = shouldBreak
        ? adjustClause(n.body, path.call(print, 'body'))
        : path.call(print, 'body', ...singleExprPath)
      parts.push(shouldBreak ? '' : ' then ')
      parts.push(body)

      return group(concat(parts), {shouldBreak})
    }
    case 'Range':
      parts.push(
        '[',
        n.from ? path.call(print, 'from') : '',
        n.exclusive ? '...' : '..',
        n.to ? path.call(print, 'to') : '',
        ']'
      )
      return concat(parts)
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
      const opening = n.loop ? 'loop' : concat([keyword, test, guard])

      if (n.postfix) {
        parts.push(path.call(print, 'body', 'body', 0), ' ')
        parts.push(opening)
        return concat(parts)
      }

      const shouldBreak = true
      const shouldIndent = !shouldBreak

      const body = adjustClause(n.body, path.call(print, 'body'))

      parts.push(
        concat([
          shouldIndent ? softline : '',
          opening,
          ifBreak('', ' then'),
          body,
        ])
      )

      return group(
        shouldIndent
          ? concat([indent(concat(parts)), softline])
          : concat(parts),
        {shouldBreak}
      )
    }
    case 'BreakStatement':
      return 'break'
    case 'ContinueStatement':
      return 'continue'
    case 'TryStatement': {
      const text = options.originalText

      return group(
        concat([
          'try',
          path.call(print, 'block'),
          util.isNextLineEmpty(text, n.block, locEnd) &&
          (n.handler || n.finalizer)
            ? hardline
            : '',
          n.handler
            ? concat([
                hardline,
                path.call(print, 'handler'),
                util.isNextLineEmpty(text, n.handler, locEnd) && n.finalizer
                  ? hardline
                  : '',
              ])
            : '',
          n.finalizer
            ? concat([hardline, 'finally', path.call(print, 'finalizer')])
            : '',
        ]),
        {shouldBreak: true}
      )
    }
    case 'CatchClause':
      return group(
        concat([
          'catch',
          n.param ? concat([' ', path.call(print, 'param')]) : '',
          path.call(print, 'body'),
        ]),
        {shouldBreak: true}
      )
    case 'ThrowStatement':
      return concat(['throw ', path.call(print, 'argument')])
    case 'SwitchStatement': {
      parts.push('switch')
      if (n.discriminant) {
        parts.push(
          ' ',
          group(
            concat([
              ifBreak('('),
              indent(concat([softline, path.call(print, 'discriminant')])),
              softline,
              ifBreak(')'),
            ])
          )
        )
      }
      const groupedCases = []
      let currentGroup = []
      const printConsequent = casePath =>
        indent(
          concat([
            hardline,
            casePath.call(
              consequentPath =>
                printStatementSequence(consequentPath, options, print),
              'consequent'
            ),
          ])
        )
      path.map(casePath => {
        const kase = casePath.getValue()
        if (kase.test) {
          currentGroup.push(casePath.call(print, 'test'))
          if (kase.consequent && kase.consequent.length) {
            groupedCases.push({
              cases: currentGroup,
              // consequent: adjustClause(
              //   kase.consequent,
              //   casePath.call(print, 'consequent')
              // ),
              consequent: printConsequent(casePath),
            })
            currentGroup = []
          }
        } else {
          // default should be last case
          groupedCases.push({
            consequent: printConsequent(casePath),
          })
        }
      }, 'cases')
      const body = []
      const lastIndex = groupedCases.length - 1
      groupedCases.map((groupedCase, i) => {
        if (groupedCase.cases) {
          body.push('when ')
          body.push(join(', ', groupedCase.cases))
        } else {
          body.push('else')
        }
        body.push(
          concat([groupedCase.consequent, i !== lastIndex ? hardline : ''])
        )
      })
      parts.push(group(indent(concat([hardline, ...body]))))
      return concat(parts)
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

      const shouldInlineButStillClosingLinebreak =
        n.expression.type === 'FunctionExpression' ||
        (isJSXNode(parent) &&
          ((isIf(n.expression) && !n.expression.postfix) ||
            (isBinaryish(n.expression) &&
              !path.call(pathNeedsParens, 'expression', 'right'))))
      const shouldInline =
        shouldInlineButStillClosingLinebreak ||
        n.expression.type === 'ArrayExpression' ||
        n.expression.type === 'ObjectExpression' ||
        n.expression.type === 'CallExpression' ||
        n.expression.type === 'TemplateLiteral' ||
        n.expression.type === 'TaggedTemplateExpression' ||
        (isJSXNode(parent) && (isIf(n.expression) || isBinaryish(n.expression)))

      if (shouldInline) {
        return group(
          concat([
            '{',
            path.call(print, 'expression'),
            shouldInlineButStillClosingLinebreak ? softline : '',
            '}',
          ])
        )
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
    case 'JSXFragment':
    case 'JSXElement': {
      const elem = printJSXElement(path, options, print)
      return elem
    }
    case 'JSXOpeningElement': {
      if (n.selfClosing && !n.attributes.length) {
        return concat(['<', path.call(print, 'name'), ' />'])
      }

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
    case 'JSXOpeningFragment':
    case 'JSXClosingFragment': {
      const isOpeningFragment = n.type === 'JSXOpeningFragment'

      if (isOpeningFragment) {
        return '<>'
      }

      return '</>'
    }
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
      const quote = n.quote || '"'
      parts.push(quote)

      path.each(childPath => {
        const i = childPath.getName()

        parts.push(print(childPath))

        if (i < expressions.length) {
          // const tabWidth = options.tabWidth
          // const indentSize = util.getIndentSize(
          //   childPath.getValue().value.raw,
          //   tabWidth
          // )

          let printed = expressions[i]

          if (
            n.expressions[i].type === 'MemberExpression' ||
            n.expressions[i].type === 'ConditionalExpression'
          ) {
            printed = concat([indent(concat([softline, printed])), softline])
          }

          // const aligned = addAlignmentToDoc(printed, indentSize, tabWidth)

          parts.push(group(concat(['#{', printed, '}'])))
        }
      }, 'quasis')

      parts.push(quote)

      return concat(parts)
    }
    case 'TaggedTemplateExpression':
      return concat([path.call(print, 'tag'), path.call(print, 'quasi')])
  }
}

function isChainableCall(node) {
  return node.type !== 'NewExpression' && isMemberish(node.callee)
}

function printRegex(node) {
  const flags = node.flags
    .split('')
    .sort()
    .join('')
  return `/${node.pattern}/${flags}`
}

function singleExpressionBlock(node, {withPath} = {}) {
  if (!(node.type === 'BlockStatement' && node.body.length === 1)) {
    return false
  }
  const singleStatement = node.body[0]
  if (singleStatement.type === 'ExpressionStatement') {
    const expr = singleStatement.expression
    return withPath
      ? {
          expr,
          path: ['body', '0', 'expression'],
        }
      : expr
  } else {
    const expr = singleStatement
    return withPath
      ? {
          expr,
          path: ['body', '0'],
        }
      : expr
  }
}

function isOnlyExpressionInFunctionBody(path) {
  // const node = path.getValue()
  const parent = path.getParentNode()
  const grandparent = path.getParentNode(1)
  const greatgrandparent = path.getParentNode(2)

  return (
    parent.type === 'ExpressionStatement' &&
    grandparent.type === 'BlockStatement' &&
    grandparent.body.length === 1 &&
    greatgrandparent.type === 'FunctionExpression' &&
    grandparent === greatgrandparent.body
  )
}

function templateLiteralHasNewLines(template) {
  return template.quasis.some(quasi => quasi.value.raw.includes('\n'))
}

function isTemplateOnItsOwnLine(n, text) {
  return (
    ((n.type === 'TemplateLiteral' && templateLiteralHasNewLines(n)) ||
      (n.type === 'TaggedTemplateExpression' &&
        templateLiteralHasNewLines(n.quasi))) &&
    !util.hasNewline(text, locStart(n), {backwards: true})
  )
}

function shouldOmitObjectBraces(path, {stackOffset = 0, ifParentBreaks} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  if (node.type === 'ObjectPattern') {
    return false
  }
  if (!node.properties.length) {
    return false
  }
  if (
    node.properties.find(
      ({shorthand, type}) => shorthand || type === 'SpreadElement'
    )
  ) {
    return false
  }

  let isRightmost
  if (
    (isRightmost = isRightmostInStatement(path, {
      stackOffset,
      ifParentBreaks,
    }))
  ) {
    return isRightmost
  }

  if (parent.type === 'JSXExpressionContainer') {
    return {indent: true, trailingLine: true}
  }
  // if (
  //   parent.type === 'CallExpression' &&
  //   parent.arguments.length === 1 &&
  //   callParensOptional(path, { stackOffset: stackOffset + 1 })
  // ) {
  //   return { indent: true, trailingLine: false }
  // }
  if (
    parent.type === 'CallExpression' &&
    parent.arguments &&
    node === parent.arguments[parent.arguments.length - 1]
  ) {
    return {indent: false, trailingLine: false}
  }
  const shouldOmitBracesButNotIndent =
    (parent.type === 'ExpressionStatement' &&
      grandparent.type === 'ClassBody') ||
    (parent.type === 'ArrayExpression' && parent.elements.length === 1) ||
    isObjectPropertyValue(path, {
      stackOffset,
      last: true,
    })
  if (shouldOmitBracesButNotIndent) {
    return {indent: false}
  }
  return false
}

function isRightmostInStatement(path, {stackOffset = 0, ifParentBreaks} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  let prevParent = node
  let parentLevel = 0
  let parent
  let indent = false
  let trailingLine
  let breakingParentCount = 0
  while ((parent = path.getParentNode(stackOffset + parentLevel))) {
    if (isBlockLevel(prevParent, parent)) {
      return {indent, trailingLine}
    }
    if (
      ifParentBreaks &&
      (isNonLastCallArg(path, {stackOffset: stackOffset + parentLevel}) ||
        isObjectPropertyValue(path, {
          stackOffset: stackOffset + parentLevel,
          // nonLast: true,
        }) ||
        parent.type === 'ArrayExpression')
    ) {
      breakingParentCount++
      return {indent, trailingLine, ifParentBreaks: true, breakingParentCount}
    }
    if (parent.type === 'AssignmentExpression' || isBinaryish(parent)) {
      if (prevParent !== parent.right) {
        return false
      }
      if (parent.type !== 'AssignmentExpression') {
        indent = true
        if (pathNeedsParens(path, {stackOffset: stackOffset + parentLevel}))
          trailingLine = true
        else if (!trailingLine) {
          trailingLine = false
        }
      }
    } else if (
      parent.type === 'ReturnStatement' ||
      parent.type === 'ThrowStatement'
    ) {
      indent = true
    } else if (
      parent.type === 'CallExpression' &&
      parent.arguments &&
      prevParent === parent.arguments[parent.arguments.length - 1]
    ) {
      indent = false
      trailingLine = false
      breakingParentCount++
    } else if (
      isObjectPropertyValue(path, {
        stackOffset: stackOffset + parentLevel,
        last: true,
      })
    ) {
      breakingParentCount++
    } else if (parent.type === 'ObjectExpression') {
      // continue
    } else {
      return false
    }
    prevParent = parent
    parentLevel++
  }
}

function isIf(node, {postfix} = {}) {
  return (
    (node.type === 'IfStatement' || node.type === 'ConditionalExpression') &&
    (!postfix || node.postfix)
  )
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

function shouldInlineLogicalExpression(node, {notJSX} = {}) {
  if (node.type !== 'LogicalExpression') {
    return false
  }

  if (
    node.right.type === 'ObjectExpression' &&
    node.right.properties.length !== 0
  ) {
    return true
  }

  if (
    node.right.type === 'ArrayExpression' &&
    node.right.elements.length !== 0
  ) {
    return true
  }

  if (!notJSX && isJSXNode(node.right)) {
    return true
  }

  return false
}

function printJSXElement(path, options, print) {
  const n = path.getValue()

  if (n.type === 'JSXElement' && isEmptyJSXElement(n)) {
    n.openingElement.selfClosing = true
    return path.call(print, 'openingElement')
  }

  const openingLines =
    n.type === 'JSXElement'
      ? path.call(print, 'openingElement')
      : path.call(print, 'openingFragment')
  const closingLines =
    n.type === 'JSXElement'
      ? path.call(print, 'closingElement')
      : path.call(print, 'closingFragment')

  if (
    n.children.length === 1 &&
    n.children[0].type === 'JSXExpressionContainer' &&
    (n.children[0].expression.type === 'TemplateLiteral' ||
      n.children[0].expression.type === 'TaggedTemplateExpression')
  ) {
    return concat([
      openingLines,
      concat(path.map(print, 'children')),
      closingLines,
    ])
  }

  n.children = n.children.map(child => {
    if (isJSXWhitespaceExpression(child)) {
      return {type: 'JSXText', value: ' ', raw: ' '}
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
    : group(concat(multilineChildren), {shouldBreak: true})

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
  if (node.children.length === 0) {
    return true
  }

  if (node.children.length > 1) {
    return false
  }

  const child = node.children[0]
  return isLiteral(child) && !isMeaningfulJSXText(child)
}

function adjustClause(node, clause) {
  if (node.type === 'BlockStatement') {
    return clause
  }

  return indent(concat([line, clause]))
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
    const {node} = printedNode
    if (
      node.type === 'CallExpression' ||
      (node.type === 'MemberExpression' && node.computed)
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
    const {node} = printedNode
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

  function isFactory(name) {
    return name.match(/(^[A-Z])|^[_$]+$/)
  }

  const shouldMerge =
    groups.length >= 2 &&
    (groups[0].length === 1 &&
      (groups[0][0].node.type === 'ThisExpression' ||
        (groups[0][0].node.type === 'Identifier' &&
          isFactory(groups[0][0].node.name))))

  function printGroup(printedGroup, {blockVisible} = {}) {
    return concat(printedGroup.map(tuple => tuple.printed), {blockVisible})
  }

  function printIndentedGroup(groups) {
    if (groups.length === 0) {
      return ''
    }
    return indent(
      group(concat([hardline, join(hardline, groups.map(printGroup))]))
    )
  }

  const lastIndex = groups.length - 1
  const printedGroups = groups.map((group, i) =>
    printGroup(group, {blockVisible: i !== lastIndex})
  )
  const oneLine = concat(printedGroups)

  const cutoff = shouldMerge ? 3 : 2
  // const flatGroups = groups
  //   .slice(0, cutoff)
  //   .reduce((res, group) => res.concat(group), [])

  if (groups.length <= cutoff) {
    return group(oneLine)
  }

  const expanded = concat([
    printGroup(groups[0]),
    shouldMerge ? concat(groups.slice(1, 2).map(printGroup)) : '',
    printIndentedGroup(groups.slice(shouldMerge ? 2 : 1)),
  ])

  const callExpressionCount = printedNodes.filter(
    tuple => tuple.node.type === 'CallExpression'
  ).length

  if (callExpressionCount >= 3 || printedGroups.slice(0, -1).some(willBreak)) {
    return group(expanded, {visible: true})
  }

  return concat([
    willBreak(oneLine) ? breakParent : '',
    conditionalGroup([oneLine, expanded], {visible: true}),
  ])
}

// function isNumericLiteral(node) {
//   return node.type === 'NumericLiteral'
// }

const operatorAliasMap = {
  or: '||',
  and: '&&',
  '==': '===',
  '!=': '!==',
  is: '===',
  isnt: '!==',
}
function getCanonicalOperator(node) {
  const {operator} = node
  if (operator === '?' && node.type === 'BinaryExpression') {
    return 'BIN?'
  }
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
    if (shouldFlatten(node, node.left)) {
      parts = parts.concat(
        path.call(left => {
          const {parts: flattenedParts, breaks} = printBinaryishExpressions(
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

    const {operator} = node
    const canonicalOperator = getCanonicalOperator(node)

    canBreak =
      (canonicalOperator === '&&' ||
        canonicalOperator === '||' ||
        canonicalOperator === 'BIN?') &&
      !isIf(node.right) &&
      !shouldInlineLogicalExpression(node, {notJSX: true})
    const right = concat([
      operator,
      canBreak ? line : ' ',
      path.call(print, 'right'),
    ])

    parts.push(' ', right)
  } else {
    parts.push(path.call(print))
  }

  return {parts, breaks: canBreak || flattenedBreaks}
}

function isBlockLevel(node, parent) {
  return (
    parent.type === 'ExpressionStatement' || parent.type === 'BlockStatement'
  )
}

function isNonLastCallArg(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)

  return (
    parent.type === 'CallExpression' &&
    node !== parent.callee &&
    node !== parent.arguments[parent.arguments.length - 1]
  )
}

function isObjectPropertyValue(path, {stackOffset = 0, nonLast, last} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)

  return (
    parent.type === 'ObjectProperty' &&
    node === parent.value &&
    (!nonLast ||
      parent !== grandparent.properties[grandparent.properties.length - 1]) &&
    (!last ||
      parent === grandparent.properties[grandparent.properties.length - 1])
  )
}

function callParensOptionalIfParentBreaks(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  return (
    isNonLastCallArg(path, {stackOffset}) ||
    // isObjectPropertyValue(path, {stackOffset}) ||
    (isChainableCall(node) && !followedByComputedAccess(path, {stackOffset})) ||
    (isFirstCallInChain(path, {stackOffset}) &&
      !followedByComputedAccess(path, {stackOffset})) ||
    isRightmostInStatement(path, {stackOffset, ifParentBreaks: true})
  )
}

function followedByComputedAccess(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  return (
    parent.type === 'MemberExpression' &&
    parent.computed &&
    node === parent.object
  )
}

function isFirstCallInChain(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  return (
    parent.type === 'MemberExpression' &&
    node === parent.object &&
    grandparent.type === 'CallExpression' &&
    parent === grandparent.callee
  )
}

function callParensOptional(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)

  return (
    pathNeedsParens(path) ||
    isBlockLevel(node, parent) ||
    isRightmostInStatement(path, {stackOffset}) ||
    (parent.type === 'AssignmentExpression' &&
      isBlockLevel(parent, grandparent)) ||
    parent.type === 'JSXExpressionContainer' ||
    parent.type === 'TemplateLiteral' ||
    (parent.type === 'ConditionalExpression' &&
      (parent.consequent === node || parent.alternate === node)) ||
    (parent.type === 'For' && parent.postfix && parent.body === node) ||
    (parent.type === 'CallExpression' &&
      parent.arguments &&
      parent.arguments[parent.arguments.length - 1] === node) ||
    (parent.type === 'ObjectProperty' &&
      node === parent.value &&
      parent === grandparent.properties[grandparent.properties.length - 1] &&
      shouldOmitObjectBraces(path, {stackOffset: stackOffset + 2}))
  )
}

function printArgumentsList(path, options, print) {
  const node = path.getValue()
  const args = node.arguments

  if (args.length === 0) {
    return concat(['(', ')'])
  }

  const lastArgIndex = args.length - 1
  let separatorParts = []
  const printedArguments = path.map((argPath, index) => {
    const arg = argPath.getNode()
    const isObject = isObjectish(arg)
    const isLast = index === lastArgIndex
    const nextIsNonFinalObject =
      !isLast && isObjectish(args[index + 1]) && index !== lastArgIndex - 1
    separatorParts = [
      ifBreak(
        isObject || nextIsNonFinalObject ? dedent(concat([line, ','])) : '',
        ','
      ),
      line,
    ]
    const parts = []
    parts.push(print(argPath))
    if (index !== lastArgIndex) {
      parts.push(concat(separatorParts))
    }

    return concat(parts)
  }, 'arguments')

  const parent = path.getParentNode()
  const parensOptional =
    node.arguments.length &&
    (callParensOptional(path) ||
      (parent.type === 'CallExpression' &&
        node === parent.arguments[parent.arguments.length - 1] &&
        callParensOptional(path, {stackOffset: 1})) ||
      (isBinaryish(parent) &&
        node === parent.right &&
        callParensOptional(path, {stackOffset: 1})))
  const parensOptionalIfParentBreaks =
    !parensOptional && callParensOptionalIfParentBreaks(path)

  const shouldntBreak =
    args.length === 1 &&
    (args[0].type === 'FunctionExpression' ||
      // args[0].type === 'ObjectExpression' ||
      isDoFunc(args[0]))
  const firstArgIsObject =
    args.length >= 1 && args[0].type === 'ObjectExpression'
  const parensUnnecessary =
    (shouldntBreak || firstArgIsObject) && parensOptional
  const parensUnnecessaryIfParentBreaks =
    shouldntBreak && parensOptionalIfParentBreaks
  const nonFinalArgs = args.slice(0, args.length - 1)
  const shouldBreak =
    args.length > 1 && nonFinalArgs.find(arg => arg.type === 'ObjectExpression')

  const openingParen = parensUnnecessary
    ? ' '
    : parensOptionalIfParentBreaks
      ? ifVisibleGroupBroke(
          parensUnnecessaryIfParentBreaks ? ' ' : ifBreak('(', ' '),
          '(',
          {count: parensOptionalIfParentBreaks.breakingParentCount || 1}
        )
      : parensOptional
        ? ifBreak('(', ' ')
        : '('
  const closingParen = parensUnnecessary
    ? ''
    : parensOptionalIfParentBreaks
      ? ifVisibleGroupBroke(
          parensUnnecessaryIfParentBreaks ? ' ' : ifBreak(')'),
          ')',
          {count: parensOptionalIfParentBreaks.breakingParentCount || 1}
        )
      : parensOptional
        ? ifBreak(')')
        : ')'

  function allArgsBrokenOut() {
    return group(
      concat([
        openingParen,
        indent(concat([line, concat(printedArguments)])),
        line,
        closingParen,
      ]),
      // {shouldBreak: true, visible: true}
      {shouldBreak: true}
    )
  }

  const shouldGroupLast = shouldGroupLastArg(args)
  if (shouldGroupLast) {
    const nonLastArgs = printedArguments.slice(0, -1)
    const shouldBreak = nonLastArgs.some(willBreak)

    let printedExpanded
    let i = 0
    path.each(argPath => {
      if (i === args.length - 1) {
        const lastArg = argPath.getValue()
        const printedLastArg = printedArguments[i]
        printedExpanded = printedArguments
          .slice(0, -1)
          .concat(
            lastArg.type === 'ObjectExpression' &&
            shouldOmitObjectBraces(argPath)
              ? indent(concat([softline, printedLastArg]))
              : printedLastArg
          )
      }
      i++
    }, 'arguments')

    // const somePrintedArgumentsWillBreak = printedArguments.some(willBreak)
    return concat([
      // somePrintedArgumentsWillBreak ? breakParent : '',
      conditionalGroup(
        [
          // concat([openingParen, concat(printedExpanded), closingParen]),
          concat([
            openingParen,
            concat(nonLastArgs),
            group(util.getLast(printedExpanded)),
            closingParen,
          ]),
          concat([
            openingParen,
            concat(nonLastArgs),
            group(util.getLast(printedExpanded), {shouldBreak: true}),
            closingParen,
          ]),
          allArgsBrokenOut(),
        ],
        {shouldBreak, visible: {firstBreakingIndex: 2}}
      ),
    ])
  }

  return shouldntBreak
    ? group(
        concat([
          openingParen,
          concat(printedArguments),
          parensUnnecessary
            ? ''
            : parensUnnecessaryIfParentBreaks
              ? ifVisibleGroupBroke('', softline, {count: 1})
              : softline,
          closingParen,
        ]),
        {visible: true}
      )
    : group(
        concat([
          openingParen,
          indent(concat([softline, concat(printedArguments)])),
          parensUnnecessary
            ? ''
            : parensUnnecessaryIfParentBreaks
              ? ifVisibleGroupBroke('', softline, {count: 1})
              : softline,
          closingParen,
        ]),
        {visible: true, shouldBreak}
      )
}

function couldGroupArg(arg) {
  return (
    (arg.type === 'ObjectExpression' && arg.properties.length > 0) ||
    (arg.type === 'ArrayExpression' && arg.elements.length > 0) ||
    arg.type === 'FunctionExpression'
  )
}

function shouldGroupLastArg(args) {
  const lastArg = util.getLast(args)
  const penultimateArg = util.getPenultimate(args)
  return (
    args.length > 1 &&
    couldGroupArg(lastArg) &&
    (!penultimateArg || !couldGroupArg(penultimateArg))
  )
}

function isTestCall(n) {
  const unitTestRe = /^(f|x)?(it|describe|test)$/

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
    shouldInlineLogicalExpression(rightNode) ||
    rightNode.type === 'ArrayExpression' ||
    rightNode.type === 'TemplateLiteral' ||
    rightNode.type === 'FunctionExpression' ||
    rightNode.type === 'ClassExpression' ||
    rightNode.type === 'ObjectPattern' ||
    isDo(rightNode) ||
    rightNode.type === 'NewExpression'

  const printed = printAssignmentRight(
    rightNode,
    printedRight,
    options,
    !dontBreak
  )

  return group(concat([printedLeft, operator, printed]))
}

function isDo(node) {
  return node.type === 'UnaryExpression' && node.operator === 'do'
}

function isDoFunc(node) {
  return isDo(node) && node.argument.type === 'FunctionExpression'
}

function printFunctionParams(path, print) {
  const fun = path.getValue()
  const {params} = fun

  if (!(params && params.length)) {
    return concat([]) // TODO: is this the right way to return "empty"?
  }

  const printed = path.map(print, 'params')
  const dontBreak = params.length === 1 && params[0].type === 'ObjectPattern'

  return concat([
    '(',
    dontBreak
      ? join(', ', printed)
      : indent(
          concat([softline, join(concat([ifBreak('', ','), line]), printed)])
        ),
    dontBreak ? '' : softline,
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

function isThisLookup(node, {shorthand} = {}) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'ThisExpression' &&
    (!shorthand || node.object.shorthand)
  )
}

function isShorthandPrototypeLookup(node) {
  return (
    node.type === 'MemberExpression' &&
    node.shorthand &&
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
    if (n.property.type !== 'Range') {
      parts.push('[')
    }
    const property = path.call(print, 'property')
    parts.push(property)
    if (n.property.type !== 'Range') {
      parts.push(']')
    }
    return concat(parts)
  }

  if (isShorthandPrototypeLookup(n)) {
    parts.push('::')
  } else {
    const precededByPrototype = isShorthandPrototypeLookup(n.object)
    if (
      !(
        (precededByPrototype || isThisLookup(n, {shorthand: true})) &&
        !optional
      )
    ) {
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
  const {key} = node

  if (isStringLiteral(key) && isIdentifierName(key.value) && !node.computed) {
    return key.value
  }
  return path.call(print, 'key')
}

function isIdentifierName(str) {
  return IDENTIFIER.test(str)
}

function isObjectish(node) {
  return node.type === 'ObjectExpression' || node.type === 'ObjectPattern'
}

function printArrayItems(path, options, printPath, print) {
  const printedElements = []
  let separatorParts = []
  const node = path.getValue()
  const last = node && node.length && node[node.length - 1]
  path.each(childPath => {
    const child = childPath.getValue()
    let isObject
    if (child && (isObject = isObjectish(child))) {
      if (separatorParts.length) {
        separatorParts[0] = ifBreak(dedent(concat([line, ','])), ',')
      }
    }
    printedElements.push(concat(separatorParts))
    printedElements.push(print(childPath))

    separatorParts = [
      ifBreak(isObject ? dedent(concat([line, ','])) : '', ','),
      line,
    ]
    const isLast = child === last
    const shouldBreakArray =
      !isLast && child && child.type === 'FunctionExpression'
    if (shouldBreakArray) {
      separatorParts.push(breakParent)
    }
    if (child && util.isNextLineEmpty(options.originalText, child, locEnd)) {
      separatorParts.push(line)
    }
  }, printPath)

  return concat(printedElements)
}

function rawText(node) {
  return node.extra ? node.extra.raw : node.raw
}

function nodeStr(node, options) {
  const raw = rawText(node)
  return util.printString(raw, options)
}

const PRECEDENCE = {}
;[
  ['BIN?'],
  ['||'],
  ['&&'],
  ['|'],
  ['^'],
  ['&'],
  ['===', '!=='],
  ['<', '>', '<=', '>=', 'in', 'instanceof', 'of'],
  ['>>', '<<', '>>>'],
  ['+', '-'],
  ['*', '/', '%'],
  ['**'],
].forEach((tier, i) => {
  tier.forEach(op => {
    PRECEDENCE[op] = i
  })
})

function getPrecedence(op) {
  return PRECEDENCE[op]
}

function isEqualityOperator(op) {
  return op === '===' || op === '!=='
}

function shouldFlatten(parent, node) {
  const parentOp = getCanonicalOperator(parent)
  const nodeOp = getCanonicalOperator(node)
  if (isEqualityOperator(parentOp) && isEqualityOperator(nodeOp)) {
    return true
  }
  return util.shouldFlatten(parentOp, nodeOp)
}
// function shouldFlatten(parentOp, nodeOp) {
//   parentOp = getCanonicalOperator(parentOp)
//   nodeOp = getCanonicalOperator(nodeOp)
//   // console.log({
//   //   parentOp,
//   //   nodeOp,
//   //   parentPrec: getPrecedence(parentOp),
//   //   nodePrec: getPrecedence(nodeOp),
//   // })
//   if (getPrecedence(nodeOp) !== getPrecedence(parentOp)) {
//     return false
//   }

//   return true
// }

// const clean = (ast, newObj) => {}
const clean = () => {}

module.exports = {
  print: genericPrint,
  embed,
  massageAstNode: clean,
}

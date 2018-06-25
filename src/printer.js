'use strict'

const util = require('prettier/src/common/util')
const comments = require('prettier/src/main/comments')
const {isNextLineEmpty, hasSameStartLine} = require('./util')
const embed = require('./embed')
const handleComments = require('./comments')
const {
  IDENTIFIER: LEADING_IDENTIFIER,
} = require('coffeescript/lib/coffeescript/lexer')

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
const {getLast, getPenultimate} = util

const sysUtil = require('util')

function isStatement(node) {
  return (
    node.type === 'BlockStatement' ||
    node.type === 'ExpressionStatement' ||
    // node.type === 'WhileStatement' ||
    node.type === 'IfStatement'
  )
}

function pathNeedsParens(path, options, {stackOffset = 0} = {}) {
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
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

  if (
    isClass(parent) &&
    parent.superClass === node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'AssignmentExpression' ||
      node.type === 'AwaitExpression' ||
      node.type === 'BinaryExpression' ||
      node.type === 'ConditionalExpression' ||
      node.type === 'LogicalExpression' ||
      node.type === 'NewExpression' ||
      node.type === 'ObjectExpression' ||
      node.type === 'SequenceExpression' ||
      node.type === 'TemplateLiteral' ||
      node.type === 'StringLiteral' ||
      node.type === 'TaggedTemplateExpression' ||
      node.type === 'UnaryExpression' ||
      node.type === 'UpdateExpression' ||
      node.type === 'YieldExpression')
  ) {
    return true
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
          if (parent.object !== node) {
            return false
          }
          if (node.operator !== 'do') {
            return true
          }
          return !(
            isDoFunc(node) &&
            path.call(
              funcPath => functionBodyWillBreak(funcPath, options),
              'argument'
            )
          )

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
        case 'AwaitExpression':
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

          if (pp < np && no === '%') {
            return !shouldFlatten(parent, node)
          }

          if (util.isBitwiseOperator(po)) {
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
      if (parent.type === 'AwaitExpression') {
        return true
      }
    // else fallthrough
    case 'AwaitExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
        case 'UnaryExpression':
        case 'BinaryExpression':
        case 'LogicalExpression':
          return true
        case 'MemberExpression':
          return node === parent.object
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
        parent.type === 'ExportDefaultDeclaration' ||
        parent.type === 'ExportNamedDeclaration' ||
        isDo(parent) ||
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

        case 'ObjectProperty':
          if (!node.postfix) {
            return false
          }
          if (grandparent.properties.length === 1) {
            return true
          }
          return {unlessParentBreaks: true}
        case 'NewExpression':
        case 'CallExpression':
          return parent.callee === node || node.postfix
        case 'BinaryExpression':
        case 'LogicalExpression':
          return true
        // return parent.right === node
        case 'JSXSpreadAttribute':
          return true
        case 'IfStatement':
        case 'ConditionalExpression':
          return node === parent.test
        default:
          return false
      }
    case 'For':
      switch (parent.type) {
        case 'CallExpression':
          return parent.callee === node || node.postfix
        case 'AssignmentExpression':
          return node.postfix
        case 'ObjectProperty':
          if (!node.postfix) {
            return false
          }
          if (grandparent.properties.length === 1) {
            return true
          }
          return {unlessParentBreaks: true}
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
        case 'NewExpression':
        case 'CallExpression':
          if (node === parent.callee) {
            return true
          }
          if (node === getLast(parent.arguments)) {
            return false
          } else {
            return {unlessParentBreaks: true}
          }
        case 'ArrayExpression':
          if (node === getLast(parent.elements)) {
            return false
          } else {
            return {unlessParentBreaks: true}
          }
        case 'For':
          return parent.postfix && node === parent.body
        case 'BinaryExpression':
        case 'LogicalExpression':
          return node === parent.left
        default:
          return false
      }
    case 'ClassExpression':
      return (
        parent.type === 'ExportDefaultDeclaration' ||
        parent.type === 'TaggedTemplateExpression' ||
        parent.type === 'ExpressionStatement' ||
        (parent.type === 'BinaryExpression' &&
          parent.left === node &&
          node.superClass) ||
        ((parent.type === 'CallExpression' ||
          parent.type === 'NewExpression') &&
          parent.callee === node) ||
        (isClass(parent) && parent.superClass === node) ||
        (parent.type === 'MemberExpression' && parent.object === node) ||
        (parent.type === 'UnaryExpression' && parent.operator === 'typeof') ||
        (isIf(parent) && parent.test === node)
      )
    case 'ObjectExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
          return true
        default:
          return false
      }
    case 'TryStatement':
      switch (parent.type) {
        case 'NewExpression':
        case 'CallExpression':
          return node === parent.callee
        default:
          return false
      }
    case 'RegExpLiteral':
      return (
        isAmbiguousRegex(node) &&
        !(
          parent.type === 'CallExpression' &&
          parent.arguments.length &&
          node === parent.arguments[0]
        )
      )
  }

  return false
}

function isAmbiguousRegex(node) {
  return (
    node.type === 'RegExpLiteral' &&
    node.pattern &&
    /^=?\s+/.test(node.pattern) &&
    node.delimiter !== '///'
  )
}

function genericPrint(path, options, print) {
  const node = path.getValue()
  const linesWithoutParens = printPathNoParens(path, options, print)

  if (!node || isEmpty(linesWithoutParens)) {
    return linesWithoutParens
  }

  const needsParens = pathNeedsParens(path, options)

  const parts = []
  if (needsParens) {
    parts.unshift(
      needsParens.unlessParentBreaks ? ifVisibleGroupBroke('', '(') : '('
    )
  }

  parts.push(linesWithoutParens)

  if (needsParens) {
    parts.push(
      needsParens.unlessParentBreaks ? ifVisibleGroupBroke('', ')') : ')'
    )
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
  const {locStart, locEnd} = options

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
      if (n.directives) {
        path.each(childPath => {
          parts.push(print(childPath), hardline)
          if (
            isNextLineEmpty(options.originalText, childPath.getValue(), locEnd)
          ) {
            parts.push(hardline)
          }
        }, 'directives')
      }
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
        [path, print, 'right'],
        options
      )
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const parent = path.getParentNode()
      const parentParent = path.getParentNode(1)
      const isInsideParenthesis =
        n === parent.test && (isIf(parent) || parent.type === 'WhileStatement')

      const {parts, breaks} = printBinaryishExpressions(
        path,
        print,
        options,
        false
      )

      if (isInsideParenthesis) {
        return concat(parts)
      }

      if (parent.type === 'UnaryExpression') {
        return group(
          concat([indent(concat([softline, concat(parts)])), softline])
        )
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
      const ungrouped = printObject(path, print, options)
      if (!ungrouped.content) {
        return ungrouped
      }
      const {content, groupOptions} = ungrouped
      return group(content, groupOptions)
    }
    case 'ObjectProperty':
      if (n.shorthand) {
        parts.push(path.call(print, 'value'))
        if (n.computed) {
          parts.unshift('[')
          parts.push(']')
        }
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
            [path, print, 'value'],
            options
          )
        )
      }

      return concat(parts)
    case 'ClassMethod':
      if (n.static) {
        parts.push(n.staticClassName ? `${n.staticClassName}.` : '@')
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
            needsForcedTrailingComma
              ? ','
              : options.comma !== 'all'
                ? ''
                : ifBreak(',', ''),
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
        concat([
          indent(
            concat([
              softline,
              join(concat([';', line]), path.map(print, 'expressions')),
            ])
          ),
          softline,
        ])
      )
    case 'ThisExpression':
      return n.shorthand ? '@' : 'this'
    case 'Super':
      return 'super'
    case 'NullLiteral':
      return 'null'
    case 'RegExpLiteral':
      return printRegex(path, print)
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
      return concat([
        !n.postfix ? '...' : '',
        n.argument ? path.call(print, 'argument') : '',
        n.postfix ? '...' : '',
      ])
    case 'FunctionExpression':
      return printFunction(path, options, print)
    case 'YieldExpression':
      parts.push('yield')

      if (n.delegate) {
        parts.push(' from')
      }
      if (n.argument) {
        parts.push(' ', path.call(print, 'argument'))
      }

      return concat(parts)
    case 'AwaitExpression':
      return concat(['await ', path.call(print, 'argument')])
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
      const hasDirectives = n.directives && n.directives.length > 0

      const parent = path.getParentNode()
      if (
        !hasContent &&
        !hasDirectives &&
        !hasDanglingComments(n) &&
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
        !hasDirectives &&
        !hasDanglingComments(n) &&
        (((parent.type === 'IfStatement' ||
          parent.type === 'ConditionalExpression') &&
          (n === parent.alternate || n === parent.consequent)) ||
          (parent.type === 'TryStatement' &&
            (n === parent.block || n === parent.finalizer)) ||
          (parent.type === 'CatchClause' && n === parent.body))
      ) {
        return ''
      }

      if (hasDirectives) {
        path.each(childPath => {
          parts.push(indent(concat([hardline, print(childPath)])))
          if (
            isNextLineEmpty(options.originalText, childPath.getValue(), locEnd)
          ) {
            parts.push(hardline)
          }
        }, 'directives')
      }

      if (hasContent) {
        const shouldInline = n.body.length === 1 && !hasDirectives
        if (shouldInline) {
          parts.push(indent(concat([softline, naked])))
        } else {
          parts.push(indent(concat([hardline, naked])))
        }
      }

      parts.push(comments.printDanglingComments(path, options))

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
          isTemplateOnItsOwnLine(
            n.arguments[0],
            options.originalText,
            options
          )) ||
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
    case 'Directive':
      return path.call(print, 'value')
    case 'DirectiveLiteral':
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
      const parent = path.getParentNode()
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

      const shouldBreak = shouldBreakIf(n, options)
      const shouldIndent = pathNeedsParens(path, options)

      const con = adjustClause(n.consequent, path.call(print, 'consequent'))

      const opening = concat([
        shouldIndent ? softline : '',
        keyword,
        test,
        ifBreak(
          '',
          concat([' then', n.consequent.type === 'BlockStatement' ? ' ' : ''])
        ),
        con,
      ])
      parts.push(opening)

      if (n.alternate) {
        const alternate = path.call(print, 'alternate')
        const hasChainedElseIf = isIf(n.alternate)
        const alt = hasChainedElseIf
          ? concat([' ', alternate])
          : adjustClause(n.alternate, alternate)
        parts.push(
          line,
          'else',
          n.consequent.type === 'BlockStatement' && !hasChainedElseIf
            ? ' '
            : '',
          alt
        )
      }

      const isChainedElseIf = parent.type === n.type && n === parent.alternate
      const content = shouldIndent
        ? concat([indent(concat(parts)), softline])
        : concat(parts)
      if (isChainedElseIf) {
        return content
      }
      return group(content, {shouldBreak})
    }
    case 'For': {
      const opening = concat([
        'for ',
        n.await ? 'await ' : '',
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
      const shouldBreak =
        !singleExpr ||
        (options.respectBreak.indexOf('control') > -1 &&
          !hasSameStartLine(n, n.body))
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

      const shouldBreak =
        !singleExpressionBlock(n.body) ||
        (options.respectBreak.indexOf('control') > -1 &&
          !hasSameStartLine(n, n.body))
      const shouldIndent = !shouldBreak

      const body = adjustClause(n.body, path.call(print, 'body'))

      parts.push(
        concat([
          shouldIndent ? softline : '',
          opening,
          ifBreak('', ' then '),
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
          isNextLineEmpty(text, n.block, locEnd) && (n.handler || n.finalizer)
            ? hardline
            : '',
          n.handler
            ? concat([
                hardline,
                path.call(print, 'handler'),
                isNextLineEmpty(text, n.handler, locEnd) && n.finalizer
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
      let currentGroupPrintedLeadingComments = null
      const printConsequent = (casePath, {isElse} = {}) => {
        const kase = casePath.getValue()
        const shouldBreak =
          kase.consequent.length !== 1 ||
          (options.respectBreak.indexOf('control') > -1 &&
            !hasSameStartLine(kase, kase.consequent[0]))
        return group(
          indent(
            concat([
              ifBreak(line, isElse ? ' ' : ' then '),
              casePath.call(
                consequentPath =>
                  printStatementSequence(consequentPath, options, print),
                'consequent'
              ),
            ])
          ),
          {shouldBreak}
        )
      }
      path.map(casePath => {
        const kase = casePath.getValue()
        if (kase.comments && kase.comments.length) {
          currentGroupPrintedLeadingComments = comments.printComments(
            casePath,
            () => '',
            options
          )
        }
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
              printedLeadingComments: currentGroupPrintedLeadingComments,
            })
            currentGroup = []
            currentGroupPrintedLeadingComments = null
          }
        } else {
          // default should be last case
          groupedCases.push({
            consequent: printConsequent(casePath, {isElse: true}),
            printedLeadingComments: currentGroupPrintedLeadingComments,
          })
        }
      }, 'cases')
      const body = []
      const lastIndex = groupedCases.length - 1
      groupedCases.forEach((groupedCase, i) => {
        if (groupedCase.printedLeadingComments) {
          body.push(groupedCase.printedLeadingComments)
        }
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
      return concat([
        '{',
        n.postfix ? '' : '...',
        path.call(print, 'argument'),
        n.postfix ? '...' : '',
        '}',
      ])
    case 'JSXExpressionContainer': {
      const parent = path.getParentNode()

      const shouldInlineButStillClosingLinebreak =
        n.expression.type === 'BlockStatement' ||
        (isJSXNode(parent) &&
          ((isIf(n.expression) && !n.expression.postfix) ||
            (isBinaryish(n.expression) &&
              !path.call(
                rightPath => pathNeedsParens(rightPath, options),
                'expression',
                'right'
              ))))
      const shouldInline =
        shouldInlineButStillClosingLinebreak ||
        n.expression.type === 'FunctionExpression' ||
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
      if (!n.comments && n.body.length === 0) {
        return ''
      }

      return concat([
        n.body.length > 0
          ? indent(
              concat([
                hardline,
                path.call(bodyPath => {
                  return printStatementSequence(bodyPath, options, print)
                }, 'body'),
              ])
            )
          : comments.printDanglingComments(path, options),
        // hardline,
      ])
    case 'ClassDeclaration':
    case 'ClassExpression':
      parts.push(concat(printClass(path, options, print)))
      return concat(parts)
    case 'TemplateElement':
      return join(literalline, n.value.raw.split(/\r?\n/g))
    case 'TemplateLiteral':
      return printTemplateLiteral(path, print)
    case 'EmptyInterpolation':
      return ''
    case 'TaggedTemplateExpression':
      return concat([path.call(print, 'tag'), path.call(print, 'quasi')])
  }
}

function shouldBreakIf(node, options) {
  return (
    isEmptyBlock(node.consequent) ||
    isEmptyBlock(node.alternate) ||
    (options.respectBreak.indexOf('control') > -1 &&
      (!hasSameStartLine(node, node.consequent) ||
        (isIf(node.alternate) && shouldBreakIf(node.alternate, options))))
  )
}

function functionBodyWillBreak(path, options) {
  const node = path.getValue()
  if (node.body.length > 1) {
    return true
  }

  return functionBodyShouldBreak(path, options)
}

function functionBodyShouldBreak(path, options) {
  const node = path.getValue()

  const singleExpr = singleExpressionBlock(node.body)

  return (
    singleExpr &&
    (isIf(singleExpr, {postfix: true}) ||
      (options.respectBreak.indexOf('functionBody') > -1 && node.body.indented))
  )
}

function printFunction(path, options, print) {
  const parts = []
  const node = path.getValue()
  const parent = path.getParentNode()
  const grandparent = path.getParentNode(1)
  parts.push(group(printFunctionParams(path, print, options)))

  parts.push(node.bound ? '=>' : '->')

  const {expr: singleExpr, path: singleExprPath} = singleExpressionBlock(
    node.body,
    {withPath: true}
  )
  const bodyShouldBreak = functionBodyShouldBreak(path, options)
  const shouldInlineBody =
    !bodyShouldBreak &&
    singleExpr &&
    (singleExpr.type === 'TaggedTemplateExpression' ||
      isLinebreakingTemplateLiteral(singleExpr) ||
      singleExpr.type === 'ArrayExpression' ||
      singleExpr.type === 'FunctionExpression')
  const body = isEmptyBlock(node.body)
    ? ''
    : shouldInlineBody
      ? concat([' ', path.call(print, 'body', ...singleExprPath)])
      : concat([ifBreak('', ' '), path.call(print, 'body')])

  // singleExpr.type === 'FunctionExpression' ||
  // grandparent.type === 'For'
  const needsParens =
    pathNeedsParens(path, options) ||
    (parent.type === 'AssignmentExpression' &&
      node === parent.right &&
      pathNeedsParens(path, options, {stackOffset: 1}))
  const isChainedDoIife =
    isDo(parent) &&
    grandparent.type === 'MemberExpression' &&
    parent === grandparent.object
  const isOnlyCallArgWithParens =
    parent.type === 'CallExpression' &&
    parent.arguments.length === 1 &&
    node === parent.arguments[0] &&
    (callParensOptional(path, options, {stackOffset: 1})
      ? false
      : callParensOptionalIfParentBreaks(path, options, {stackOffset: 1})
        ? {unlessParentBreaks: true}
        : true)
  const bodyParts = concat([
    body,
    isChainedDoIife || parent.type === 'JSXExpressionContainer'
      ? softline
      : isOnlyCallArgWithParens
        ? isOnlyCallArgWithParens.unlessParentBreaks
          ? ifVisibleGroupBroke('', softline, {count: 1})
          : softline
        : needsParens
          ? needsParens.unlessParentBreaks
            ? ifVisibleGroupBroke('', softline)
            : softline
          : '',
  ])
  return group(
    concat([
      concat(parts),
      shouldInlineBody
        ? bodyParts
        : group(bodyParts, {shouldBreak: bodyShouldBreak}),
    ])
  )
}

function isLinebreakingTemplateLiteral(node) {
  return (
    node.type === 'TemplateLiteral' &&
    node.quasis.length &&
    node.quasis[0].value.raw.indexOf('\n') >= 0
  )
}

function printObject(path, print, options) {
  const node = path.getValue()
  const parent = path.getParentNode()
  const grandparent = path.getParentNode(1)
  const {locEnd} = options
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
    if (isNextLineEmpty(options.originalText, prop.node, locEnd)) {
      separatorParts.push(hardline)
    }
    return result
  })

  if (joinedProps.length === 0) {
    return concat(['{', '}'])
  }

  const shouldOmitBraces =
    shouldOmitObjectBraces(path, options) ||
    (!objectRequiresBraces(path) &&
      isCallArgument(path, {beforeTrailingFunction: true}))
  const shouldOmitBracesIfParentBreaks =
    !shouldOmitBraces &&
    shouldOmitObjectBraces(path, options, {ifParentBreaks: true})
  const shouldOmitBracesUnlessBreaks =
    !shouldOmitBraces &&
    !shouldOmitBracesIfParentBreaks &&
    shouldOmitObjectBraces(path, options, {unlessBreaks: true})
  let dontIndent = false
  let trailingLine = true
  if (shouldOmitBraces && !shouldOmitBraces.indent) {
    dontIndent = true
  }
  if (shouldOmitBraces && shouldOmitBraces.trailingLine === false) {
    trailingLine = false
  }
  const isClassBody =
    parent.type === 'ExpressionStatement' && grandparent.type === 'ClassBody'
  const props = node.properties
  const isNestedObject =
    node.type === 'ObjectExpression' &&
    props.length > 1 &&
    props.find(({shorthand}) => !shorthand) &&
    parent.type === 'ObjectProperty' &&
    node === parent.value
  // const isCallArg = props.length > 1 && isCallArgument(path)
  // const isNonTrailingCallArg =
  //   isCallArg && !isCallArgument(path, {last: 'orBeforeTrailingFunction'})
  const shouldBreak =
    isClassBody || // (shouldOmitBraces && n.properties.length > 1)
    // isNestedObject ||
    // isNonTrailingCallArg ||
    (props.length > 1 &&
      props.find(
        ({value}) =>
          value && //(value.type === 'ObjectExpression' &&
          // value.properties.length >= 1) ||
          // value.type === 'FunctionExpression' ||
          ((value.type === 'ConditionalExpression' && value.postfix) ||
            (value.type === 'For' && value.postfix))
      )) ||
    (node.type === 'ObjectExpression' &&
      options.respectBreak.indexOf('object') > -1 &&
      props.length > 1 &&
      util.hasNewlineInRange(
        options.originalText,
        options.locStart(node),
        options.locEnd(node)
      ))
  const shouldBreakIfParentBreaks = false
  // isCallArg || (props.length > 1 && parent.type === 'ArrayExpression')
  if (shouldOmitBraces && (isClassBody || isNestedObject)) {
    dontIndent = true
  }
  if (
    shouldOmitBracesIfParentBreaks &&
    shouldOmitBracesIfParentBreaks.indent === false
  ) {
    dontIndent = {ifParentBreaks: true}
  }
  const bracketSpacingLine = options.bracketSpacing ? line : softline
  const propsChunk = concat([
    shouldOmitBraces
      ? dontIndent
        ? ''
        : softline
      : shouldOmitBracesIfParentBreaks
        ? ifVisibleGroupBroke(
            dontIndent.ifParentBreaks ? '' : softline,
            bracketSpacingLine,
            {count: 1}
          )
        : bracketSpacingLine,
    concat(joinedProps),
  ])
  const content = concat([
    shouldOmitBracesIfParentBreaks
      ? ifVisibleGroupBroke('', '{', {count: 1})
      : shouldOmitBraces
        ? ''
        : shouldOmitBracesUnlessBreaks
          ? ifVisibleGroupBroke('{', '')
          : '{',
    dontIndent === true
      ? concat(joinedProps)
      : dontIndent.ifParentBreaks
        ? propsChunk
        : indent(propsChunk),
    concat([
      dontIndent === true || !trailingLine
        ? ''
        : shouldOmitBraces || !options.bracketSpacing
          ? dontIndent
            ? ''
            : softline
          : shouldOmitBracesIfParentBreaks
            ? ifVisibleGroupBroke('', line, {
                count: 1,
              })
            : line,
      shouldOmitBracesIfParentBreaks
        ? ifVisibleGroupBroke('', '}', {count: 1})
        : shouldOmitBraces
          ? ''
          : shouldOmitBracesUnlessBreaks
            ? ifVisibleGroupBroke('}', '')
            : '}',
    ]),
  ])
  return {
    content,
    groupOptions: {
      shouldBreak,
      visible: true,
      shouldBreakIfVisibleGroupBroke: shouldBreakIfParentBreaks,
    },
  }
}

function isClass(node) {
  return (
    node &&
    (node.type === 'ClassExpression' || node.type === 'ClassDeclaration')
  )
}

function printTemplateLiteral(path, print, {omitQuotes} = {}) {
  const parts = []
  const node = path.getValue()
  const expressions = path.map(print, 'expressions')
  const quote = omitQuotes ? '' : node.quote || '"'
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
        node.expressions[i].type === 'MemberExpression' ||
        node.expressions[i].type === 'ConditionalExpression'
      ) {
        printed = concat([indent(concat([softline, printed])), softline])
      } else if (node.expressions[i].type === 'BlockStatement') {
        printed = concat([printed, softline])
      }

      // const aligned = addAlignmentToDoc(printed, indentSize, tabWidth)

      parts.push(group(concat(['#{', printed, '}'])))
    }
  }, 'quasis')

  parts.push(quote)

  return concat(parts)
}

function isChainableCall(node) {
  return node.type === 'CallExpression' && isMemberish(node.callee)
}

function printRegex(path, print) {
  const node = path.getValue()
  const delim = node.delimiter || '/'
  const flags = node.flags
    .split('')
    .sort()
    .join('')
  const pattern = node.interpolatedPattern
    ? path.call(
        patternPath =>
          printTemplateLiteral(patternPath, print, {omitQuotes: true}),
        'interpolatedPattern'
      )
    : node.pattern
  return concat([delim, pattern, delim, flags])
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

function isTemplateOnItsOwnLine(n, text, {locStart}) {
  return (
    ((n.type === 'TemplateLiteral' && templateLiteralHasNewLines(n)) ||
      (n.type === 'TaggedTemplateExpression' &&
        templateLiteralHasNewLines(n.quasi))) &&
    !util.hasNewline(text, locStart(n), {backwards: true})
  )
}

function objectRequiresBraces(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  if (node.type === 'ObjectPattern') {
    return true
  }
  if (!node.properties.length) {
    return true
  }
  if (
    node.properties.find(
      ({shorthand, type}) => shorthand || type === 'SpreadElement'
    )
  ) {
    return true
  }
  return false
}

function trailingObjectIsntOptions(callee) {
  if (callee.type === 'Identifier' && callee.name === 'deepEqual') {
    return true
  }
  return false
}

function shouldOmitObjectBraces(
  path,
  options,
  {stackOffset = 0, ifParentBreaks, unlessBreaks} = {}
) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)

  if (objectRequiresBraces(path, {stackOffset})) {
    return false
  }

  if (isIf(parent, {postfix: true})) {
    return false
  }

  if (parent.type === 'ReturnStatement' && isIf(grandparent, {postfix: true})) {
    return unlessBreaks
  }

  if (
    parent.type === 'CallExpression' &&
    node !== parent.callee &&
    trailingObjectIsntOptions(parent.callee)
  ) {
    return ifParentBreaks
  }

  let isRightmost
  if (
    (isRightmost = isRightmostInStatement(path, options, {
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
  //   callParensOptional(path, options, { stackOffset: stackOffset + 1 })
  // ) {
  //   return { indent: true, trailingLine: false }
  // }
  if (isCallArgument(path, {last: true, stackOffset})) {
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

function isRightmostInStatement(
  path,
  options,
  {stackOffset = 0, ifParentBreaks} = {}
) {
  const node = path.getParentNode(stackOffset - 1)
  let prevParent = node
  let parentLevel = 0
  let parent
  let indent = false
  let trailingLine
  let breakingParentCount = 0
  while ((parent = path.getParentNode(stackOffset + parentLevel))) {
    const grandparent = path.getParentNode(stackOffset + parentLevel + 1)
    if (
      isBlockLevel(prevParent, parent) ||
      (isIf(parent) &&
        (prevParent === parent.test ||
          prevParent === parent.consequent ||
          prevParent === parent.alternate)) ||
      (parent.type === 'SwitchStatement' &&
        prevParent === parent.discriminant) ||
      (parent.type === 'For' && prevParent === parent.source) ||
      (parent.type === 'WhileStatement' && prevParent === parent.test) ||
      (parent.type === 'ClassExpression' &&
        prevParent === parent.superClass &&
        ((parent.body && parent.body.body.length) ||
          isBlockLevel(parent, grandparent))) ||
      parent.type === 'SequenceExpression' ||
      (parent.type === 'ArrayExpression' && parent.elements.length === 1)
    ) {
      return {indent, trailingLine}
    }
    if (
      ifParentBreaks &&
      (isCallArgument(path, {
        nonLast: true,
        stackOffset: stackOffset + parentLevel,
      }) ||
        isObjectPropertyValue(path, {
          stackOffset: stackOffset + parentLevel,
          // nonLast: true,
        }) ||
        parent.type === 'ArrayExpression' ||
        (isChainableCall(prevParent) &&
          parent.type === 'MemberExpression' &&
          grandparent.type === 'CallExpression' &&
          parent === grandparent.callee) ||
        (isFirstCallInChain(path, {
          stackOffset: stackOffset + parentLevel,
        }) &&
          !followedByComputedAccess(path, {
            stackOffset: stackOffset + parentLevel,
          })))
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
        if (
          pathNeedsParens(path, options, {
            stackOffset: stackOffset + parentLevel,
          })
        )
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
      trailingLine = grandparent.type !== 'BlockStatement'
    } else if (
      isCallArgument(path, {
        last: true,
        stackOffset: stackOffset + parentLevel,
      })
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
    } else if (
      parent.type === 'ObjectExpression' ||
      parent.type === 'UnaryExpression' ||
      parent.type === 'YieldExpression' ||
      parent.type === 'AwaitExpression'
    ) {
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
    node &&
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
    objMethod.operator === '=' ? ' =' : ':',
    ' ',
    comments.printDanglingComments(path, options, true),
    hasDanglingComments(objMethod) ? ' ' : '',
    printFunction(path, options, print)
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
    const printed = concat(['extends ', path.call(print, 'superClass')])
    parts.push(
      ' ',
      path.call(
        superClass =>
          comments.printComments(superClass, () => printed, options),
        'superClass'
      )
    )
  }

  parts.push(path.call(print, 'body'))
  if (
    pathNeedsParens(path, options) &&
    n.body &&
    n.body.body &&
    n.body.body.length
  ) {
    parts.push(hardline)
  }

  return parts
}

function isEmptyBlock(node) {
  return (
    node &&
    node.type === 'BlockStatement' &&
    !node.body.length &&
    !hasDanglingComments(node) &&
    !(node.directives && node.directives.length)
  )
}

function printExportDeclaration(path, options, print) {
  const decl = path.getValue()
  const parts = ['export ']

  if (decl['default'] || decl.type === 'ExportDefaultDeclaration') {
    parts.push('default ')
  }

  if (decl.declaration) {
    const printedDecl = path.call(print, 'declaration')
    if (
      decl.declaration.type === 'ObjectExpression' &&
      path.call(
        declPath => shouldOmitObjectBraces(declPath, options),
        'declaration'
      )
    ) {
      parts.push(indent(concat([softline, printedDecl])))
    } else {
      parts.push(printedDecl)
    }
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

function shouldInlineLogicalExpression(node, {notJSX} = {}) {
  if (
    !(
      node.type === 'LogicalExpression' ||
      (node.type === 'BinaryExpression' && node.operator === '?')
    )
  ) {
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
    node.type === 'DirectiveLiteral' ||
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
    const unindented = group(
      concat([hardline, join(hardline, groups.map(printGroup))])
    )
    return options.indentChain ? indent(unindented) : unindented
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

  const callExpressions = printedNodes.filter(
    tuple => tuple.node.type === 'CallExpression'
  )
  const callExpressionCount = callExpressions.length

  if (
    callExpressionCount >= 3 ||
    (callExpressionCount === 2 &&
      callExpressions.some(({node}) =>
        node.arguments.some(({type}) => type === 'FunctionExpression')
      )) ||
    printedGroups.slice(0, -1).some(willBreak)
  ) {
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

function printBinaryishExpressions(path, print, options, isNested) {
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
            print,
            options,
            true
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

    if (isNested && node.comments) {
      parts = comments.printComments(path, () => concat(parts), options)
    }
  } else {
    parts.push(path.call(print))
  }

  return {parts, breaks: canBreak || flattenedBreaks}
}

function isBlockLevel(node, parent) {
  return (
    parent.type === 'ExpressionStatement' ||
    parent.type === 'BlockStatement' ||
    parent.type === 'ExportDefaultDeclaration' ||
    (parent.type === 'SwitchCase' && node !== parent.test)
  )
}

function isCallArgument(
  path,
  {nonLast, last, beforeTrailingFunction, stackOffset = 0} = {}
) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)

  if (
    !(
      (parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
      node !== parent.callee
    )
  ) {
    return false
  }
  const args = parent.arguments
  if (nonLast) {
    return node !== getLast(args)
  }
  const isBeforeTrailingFunction =
    node === getPenultimate(args) && getLast(args).type === 'FunctionExpression'
  if (last) {
    if (node === getLast(args)) {
      return true
    }
    if (last === 'orBeforeTrailingFunction') {
      return isBeforeTrailingFunction
    }
    return false
  }
  if (beforeTrailingFunction) {
    return isBeforeTrailingFunction
  }
  return true
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

function callParensOptionalIfParentBreaks(
  path,
  options,
  {stackOffset = 0} = {}
) {
  return isRightmostInStatement(path, options, {
    stackOffset,
    ifParentBreaks: true,
  })
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
    node.type === 'CallExpression' &&
    node.callee.type !== 'MemberExpression' &&
    parent.type === 'MemberExpression' &&
    node === parent.object &&
    grandparent.type === 'CallExpression' &&
    parent === grandparent.callee
  )
}

function callParensNecessary(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)

  if (
    node.arguments.length &&
    node.arguments[0].type === 'RegExpLiteral' &&
    isAmbiguousRegex(node.arguments[0])
  ) {
    return true
  }
  if (
    node.callee.type === 'Identifier' &&
    (node.callee.name === 'get' || node.callee.name === 'set')
  ) {
    return true
  }
  return false
}

function callParensOptional(path, options, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)

  return (
    pathNeedsParens(path, options) ||
    isBlockLevel(node, parent) ||
    isRightmostInStatement(path, options, {stackOffset}) ||
    (parent.type === 'AssignmentExpression' &&
      isBlockLevel(parent, grandparent)) ||
    parent.type === 'JSXExpressionContainer' ||
    parent.type === 'TemplateLiteral' ||
    (parent.type === 'ConditionalExpression' &&
      (parent.consequent === node || parent.alternate === node)) ||
    (parent.type === 'For' && parent.postfix && parent.body === node) ||
    (parent.type === 'CallExpression' && node === getLast(parent.arguments)) ||
    (parent.type === 'ObjectProperty' &&
      node === parent.value &&
      parent === getLast(grandparent.properties) &&
      shouldOmitObjectBraces(path, options, {stackOffset: stackOffset + 2}))
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
    // const consecutiveIf = !isLast && isIf(arg) && isIf(args[index + 1])
    separatorParts = [
      ifBreak(
        isObject || nextIsNonFinalObject // || consecutiveIf
          ? dedent(concat([line, ',']))
          : options.comma !== 'none'
            ? ','
            : '',
        ','
      ),
      line,
    ]
    const parts = []
    parts.push(print(argPath))
    if (index !== lastArgIndex) {
      parts.push(concat(separatorParts))
    } else if (index === lastArgIndex && options.comma === 'all') {
      parts.push(ifBreak(','))
    }

    return concat(parts)
  }, 'arguments')

  const parent = path.getParentNode()
  const parensNecessary = callParensNecessary(path)
  const parensOptional =
    !parensNecessary &&
    node.arguments.length &&
    (callParensOptional(path, options) ||
      (parent.type === 'CallExpression' &&
        node === parent.arguments[parent.arguments.length - 1] &&
        callParensOptional(path, options, {stackOffset: 1})) ||
      (isBinaryish(parent) &&
        node === parent.right &&
        callParensOptional(path, options, {stackOffset: 1})))
  const parensOptionalIfParentBreaks =
    !parensNecessary &&
    !parensOptional &&
    callParensOptionalIfParentBreaks(path, options)

  const shouldntBreak =
    args.length === 1 &&
    (args[0].type === 'FunctionExpression' ||
      args[0].type === 'ArrayExpression' ||
      (args[0].type === 'ObjectExpression' &&
        path.call(objectRequiresBraces, 'arguments', '0')) ||
      isDoFunc(args[0]))
  const firstArgIsObject =
    args.length >= 1 &&
    args[0].type === 'ObjectExpression' &&
    !path.call(objectRequiresBraces, 'arguments', '0')
  const isRightSideOfAssignment =
    (parent.type === 'AssignmentExpression' && node === parent.right) ||
    (parent.type === 'ObjectProperty' && node === parent.value)
  const isIfTest = isIf(parent) && node === parent.test

  const unnecessary =
    shouldntBreak || (firstArgIsObject && !isRightSideOfAssignment && !isIfTest)
  const parensUnnecessary = unnecessary && parensOptional
  const parensUnnecessaryIfParentBreaks =
    unnecessary && parensOptionalIfParentBreaks
  // const nonFinalArgs = args.slice(0, args.length - 1)
  const shouldBreak = false
  // args.length > 1 && nonFinalArgs.find(arg => arg.type === 'ObjectExpression')
  const closingLinebreakAnyway =
    parensUnnecessary && parent.type === 'JSXExpressionContainer'

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
    ? closingLinebreakAnyway
      ? softline
      : ''
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
        parensUnnecessary
          ? ''
          : parensUnnecessaryIfParentBreaks
            ? ifVisibleGroupBroke('', softline, {count: 1})
            : softline,
        closingParen,
      ]),
      // {shouldBreak: true, visible: true}
      {shouldBreak: true}
    )
  }

  const shouldGroupLast = shouldGroupLastArg(path, options)
  let groupLastPrinted
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
            (lastArg.type === 'ObjectExpression' &&
              shouldOmitObjectBraces(argPath, options)) ||
            shouldGroupLast.indent
              ? indent(concat([softline, printedLastArg]))
              : printedLastArg
          )
      }
      i++
    }, 'arguments')

    const dontBreakAny = concat([
      openingParen,
      concat(nonLastArgs),
      group(util.getLast(printedExpanded)),
      closingParen,
    ])
    const breakLast = concat([
      openingParen,
      concat(nonLastArgs),
      group(util.getLast(printedExpanded), {
        shouldBreak: true,
        visible: true,
      }),
      closingParen,
    ])
    const somePrintedArgumentsWillBreak = printedArguments.some(willBreak)
    const lastAlwaysBreaks = willBreak(util.getLast(printedExpanded))
    let firstBreakingIndex = 1
    const conditionalGroups = [breakLast, allArgsBrokenOut()]
    if (!lastAlwaysBreaks) {
      conditionalGroups.unshift(dontBreakAny)
      firstBreakingIndex++
    }
    groupLastPrinted = concat([
      somePrintedArgumentsWillBreak && parent.type !== 'AssignmentExpression'
        ? breakParent
        : '',
      conditionalGroup(conditionalGroups, {
        shouldBreak,
        visible: true,
        firstBreakingIndex,
      }),
    ])
    if (!shouldGroupLast.ifParentBreaks) {
      return groupLastPrinted
    }
  }

  const printed = shouldntBreak
    ? group(concat([openingParen, concat(printedArguments), closingParen]), {
        visible: true,
      })
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
  return groupLastPrinted
    ? ifVisibleGroupBroke(groupLastPrinted, printed)
    : printed
}

function couldGroupArg(arg) {
  if (
    (arg.type === 'ObjectExpression' && arg.properties.length > 0) ||
    (arg.type === 'ArrayExpression' && arg.elements.length > 0) ||
    arg.type === 'FunctionExpression' ||
    isLinebreakingTemplateLiteral(arg) ||
    isDoFunc(arg)
  ) {
    return true
  }
  if (arg.type === 'ConditionalExpression' || arg.type === 'TryStatement') {
    return {indent: true}
  }
  return false
}

function shouldGroupLastArg(path, options) {
  const node = path.getValue()
  const parent = path.getParentNode()
  const args = node.arguments
  const isRightmost = isRightmostInStatement(path, options, {
    ifParentBreaks: true,
  })
  if (!isRightmost) {
    return false
  }
  if (isFirstCallInChain(path) && options.indentChain) {
    return false
  }
  const lastArg = util.getLast(args)
  const penultimateArg = util.getPenultimate(args)
  const couldGroup = lastArg && couldGroupArg(lastArg)
  if (
    isIf(parent) &&
    node === parent.test &&
    lastArg.type === 'ObjectExpression'
  ) {
    return false
  }
  if (
    args.length > 1 &&
    couldGroup &&
    (!penultimateArg ||
      (lastArg.type === 'FunctionExpression'
        ? penultimateArg.type !== 'FunctionExpression'
        : !couldGroupArg(penultimateArg)))
  ) {
    return {
      ifParentBreaks: isRightmost.ifParentBreaks,
      indent: couldGroup.indent,
    }
  }
  return false
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
  const broken = ifBreak(
    indent(concat([line, printedRight])),
    concat([line, printedRight])
  )
  const nonbroken = concat([' ', printedRight])
  if (canBreak) {
    return canBreak.ifParentBreaks
      ? ifVisibleGroupBroke(broken, nonbroken)
      : broken
  }

  return nonbroken
}

function printAssignment(
  leftNode,
  printedLeft,
  operator,
  rightNode,
  [path, print, rightName],
  options
) {
  const printedRight = path.call(print, rightName)
  const dontBreak =
    shouldInlineLogicalExpression(rightNode) ||
    rightNode.type === 'ArrayExpression' ||
    rightNode.type === 'TemplateLiteral' ||
    rightNode.type === 'FunctionExpression' ||
    rightNode.type === 'ClassExpression' ||
    rightNode.type === 'UnaryExpression' ||
    rightNode.type === 'SequenceExpression' ||
    // (rightNode.type === 'For' && !rightNode.postfix) ||
    // rightNode.type === 'SwitchStatement' ||
    rightNode.type === 'ObjectPattern' ||
    (rightNode.type === 'ObjectExpression' &&
      !path.call(
        rightPath =>
          shouldOmitObjectBraces(rightPath, options, {ifParentBreaks: true}),
        rightName
      )) ||
    isDo(rightNode) ||
    rightNode.type === 'NewExpression' ||
    (rightNode.type === 'CallExpression' &&
      (rightNode.callee.type === 'Identifier' ||
        rightNode.callee.type === 'MemberExpression'))

  const printed = printAssignmentRight(
    rightNode,
    printedRight,
    options,
    !dontBreak
  )

  const full = concat([printedLeft, operator, printed])
  if (
    willBreak(printed) &&
    !(
      rightNode.type === 'CallExpression' &&
      path.call(rightPath => shouldGroupLastArg(rightPath, options), rightName)
    )
  ) {
    return group(full, {shouldBreak: true})
  }
  const tryAndBreakLeftOnly = !(
    leftNode.type === 'Identifier' ||
    isStringLiteral(leftNode) ||
    leftNode.type === 'MemberExpression'
  )
  const singleGroup = group(full)
  if (!tryAndBreakLeftOnly) {
    return singleGroup
  }

  let printedLeftUngrouped
  if (leftNode.type === 'ObjectPattern') {
    printedLeftUngrouped = path.call(
      leftPath => printObject(leftPath, print, options),
      'left'
    )
    if (!printedLeftUngrouped.content) {
      printedLeftUngrouped = null
    }
  }
  return conditionalGroup(
    [
      full,
      concat([
        printedLeftUngrouped
          ? group(
              printedLeftUngrouped.content,
              Object.assign({}, printedLeftUngrouped.groupOptions, {
                shouldBreak: true,
              })
            )
          : group(printedLeft, {shouldBreak: true}),
        operator,
        group(printed),
      ]),
      singleGroup,
    ],
    {firstBreakingIndex: 1}
  )
}

function isDo(node) {
  return node.type === 'UnaryExpression' && node.operator === 'do'
}

function isDoFunc(node) {
  return isDo(node) && node.argument.type === 'FunctionExpression'
}

function printFunctionParams(path, print, options) {
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
          concat([
            softline,
            join(
              concat([ifBreak(options.comma !== 'none' ? ',' : '', ','), line]),
              printed
            ),
          ])
        ),
    dontBreak ? '' : concat([options.comma === 'all' ? ',' : '', softline]),
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
  const {locEnd} = options

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

    if (isNextLineEmpty(text, stmt, locEnd) && !isLastStatement(stmtPath)) {
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

const IDENTIFIER = new RegExp(`${LEADING_IDENTIFIER.source}$`)
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
  const elements = node[printPath]
  const last = elements && elements.length && elements[elements.length - 1]
  const {locEnd} = options
  // let index = 0
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

    const isLast = child === last
    // const consecutiveIf =
    //   child &&
    //   !isLast &&
    //   isIf(child) &&
    //   elements[index + 1] &&
    //   isIf(elements[index + 1])
    separatorParts = [
      ifBreak(
        isObject // || consecutiveIf
          ? dedent(concat([line, ',']))
          : options.comma !== 'none'
            ? ','
            : '',
        ','
      ),
      line,
    ]
    const shouldBreakArray =
      !isLast && child && child.type === 'FunctionExpression'
    if (shouldBreakArray) {
      separatorParts.push(breakParent)
    }
    if (child && isNextLineEmpty(options.originalText, child, locEnd)) {
      separatorParts.push(softline)
    }
    // index++
  }, printPath)

  return concat(printedElements)
}

function rawText(node) {
  return node.extra ? node.extra.raw : node.raw
}

function nodeStr(node, options) {
  const raw = rawText(node)
  return printString(raw, options)
}

function printString(raw, options, isDirectiveLiteral) {
  // `rawContent` is the string exactly like it appeared in the input source
  // code, without its enclosing quotes.
  const rawContent = raw.slice(1, -1)

  const double = {quote: '"', regex: /"/g}
  const single = {quote: "'", regex: /'/g}

  const preferred = options.singleQuote ? single : double
  const alternate = preferred === single ? double : single

  let shouldUseAlternateQuote = false
  let canChangeDirectiveQuotes = false

  // If `rawContent` contains at least one of the quote preferred for enclosing
  // the string, we might want to enclose with the alternate quote instead, to
  // minimize the number of escaped quotes.
  // Also check for the alternate quote, to determine if we're allowed to swap
  // the quotes on a DirectiveLiteral.
  if (
    rawContent.includes(preferred.quote) ||
    rawContent.includes(alternate.quote)
  ) {
    const numPreferredQuotes = (rawContent.match(preferred.regex) || []).length
    const numAlternateQuotes = (rawContent.match(alternate.regex) || []).length

    shouldUseAlternateQuote = numPreferredQuotes > numAlternateQuotes
  } else {
    canChangeDirectiveQuotes = true
  }
  if (rawContent.includes('#{')) {
    shouldUseAlternateQuote = preferred.quote === '"'
  }

  const enclosingQuote = shouldUseAlternateQuote
    ? alternate.quote
    : preferred.quote

  // Directives are exact code unit sequences, which means that you can't
  // change the escape sequences they use.
  // See https://github.com/prettier/prettier/issues/1555
  // and https://tc39.github.io/ecma262/#directive-prologue
  if (isDirectiveLiteral) {
    if (canChangeDirectiveQuotes) {
      return enclosingQuote + rawContent + enclosingQuote
    }
    return raw
  }

  // It might sound unnecessary to use `makeString` even if the string already
  // is enclosed with `enclosingQuote`, but it isn't. The string could contain
  // unnecessary escapes (such as in `"\'"`). Always using `makeString` makes
  // sure that we consistently output the minimum amount of escaped quotes.
  return util.makeString(rawContent, enclosingQuote, false)
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

function printComment(commentPath /*, options */) {
  const comment = commentPath.getValue()

  switch (comment.type) {
    case 'CommentBlock':
      return '###' + comment.value + '###'
    case 'CommentLine':
      return '#' + comment.value.trimRight()
    default:
      throw new Error('Not a comment: ' + JSON.stringify(comment))
  }
}

function canAttachComment(node) {
  return (
    node.type &&
    node.type !== 'CommentBlock' &&
    node.type !== 'CommentLine' &&
    node.type !== 'TemplateElement'
  )
}

function hasDanglingComments(node) {
  return (
    node.comments &&
    node.comments.some(comment => !comment.leading && !comment.trailing)
  )
}

function willPrintOwnComments(path) {
  const node = path.getValue()
  const parent = path.getParentNode()

  return isClass(parent) && parent.superClass === node
}

module.exports = {
  print: genericPrint,
  embed,
  massageAstNode: clean,
  willPrintOwnComments,
  canAttachComment,
  printComment,
  isBlockComment: handleComments.isBlockComment,
  handleComments: {
    ownLine: handleComments.handleOwnLineComment,
    remaining: handleComments.handleRemainingComment,
  },
}

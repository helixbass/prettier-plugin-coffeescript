'use strict'

const util = require('prettier/src/common/util')
const comments = require('prettier/src/main/comments')
const {
  isNextLineEmpty,
  hasSameStartLine,
  getNextNonSpaceNonCommentCharacter,
  isFunction,
} = require('./util')
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
  blockVisible,
  indent,
  join,
  literalline,
  line,
  softline,
  lineSuffixBoundary,
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
  const greatgrandparent = path.getParentNode(stackOffset + 2)
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
    (isFunction(node) ||
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
        case 'Range':
        case 'SpreadElement':
          return true
        case 'MemberExpression':
          return parent.object === node
        case 'BinaryExpression':
        case 'LogicalExpression': {
          const po = getCanonicalOperator(parent)
          const pp = getPrecedence(po)
          const no = getCanonicalOperator(node)
          const np = getPrecedence(no)

          if (pp > np) {
            return true
          }

          if ((po === '||' || po === '??') && no === '&&') {
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
      if (
        parent.type === 'ExpressionStatement' &&
        !node.returns &&
        grandparent.body &&
        (grandparent.type !== 'BlockStatement' ||
          (grandparent === greatgrandparent.body &&
            grandparent.body.length > 1)) &&
        parent === grandparent.body[0]
      ) {
        return true
      }
    // fallthrough
    case 'TemplateLiteral':
    case 'NumericLiteral':
      return (
        (parent.type === 'TaggedTemplateExpression' && node === parent.tag) ||
        (parent.type === 'CallExpression' && node === parent.callee)
      )
    case 'AssignmentExpression':
      if (isPostfixForBody(path)) {
        return true
      }
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
      if (isCondition(node, parent)) {
        return false
      }
      return true
    case 'ConditionalExpression':
      if (isPostfixBody(path)) {
        return true
      }
      if (isCondition(node, parent)) {
        return {unlessParentBreaks: true}
      }
      switch (parent.type) {
        case 'TaggedTemplateExpression':
        case 'Range':
        case 'ReturnStatement':
        case 'ThrowStatement':
        case 'UnaryExpression':
        case 'SpreadElement':
          return true

        case 'MemberExpression':
          return !(parent.property === node && parent.computed)

        case 'For':
          return parent.postfix

        // case 'ExpressionStatement':
        //   return !node.postfix

        case 'ObjectProperty':
          if (
            node.postfix &&
            node === parent.value &&
            grandparent.properties.length === 1
          ) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          return false
        case 'NewExpression':
        case 'CallExpression':
          if (node !== parent.callee && node !== getLast(parent.arguments)) {
            return {unlessParentBreaks: true}
          }
          return parent.callee === node || node.postfix
        case 'BinaryExpression':
        case 'LogicalExpression':
          return true
        // return parent.right === node
        case 'JSXSpreadAttribute':
          return true
        case 'AssignmentExpression':
          if (isPostfixBody(path, {stackOffset: 1})) {
            return true
          }
          if (node.postfix) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          return false
        case 'SwitchCase':
          return parent.test === node
        default:
          return false
      }
    case 'For':
      switch (parent.type) {
        case 'CallExpression':
          return parent.callee === node || node.postfix
        case 'AssignmentExpression':
          if (node.postfix) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          return false
        case 'ObjectProperty':
          if (
            node.postfix &&
            node === parent.value &&
            grandparent.properties.length === 1
          ) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          return false
        case 'ReturnStatement':
        case 'MemberExpression':
        case 'SpreadElement':
        case 'JSXSpreadAttribute':
          return true
        default:
          return false
      }
    case 'WhileStatement':
      switch (parent.type) {
        case 'AssignmentExpression':
          if (node.postfix) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          return false
        case 'ObjectProperty':
          if (
            node.postfix &&
            node === parent.value &&
            grandparent.properties.length === 1
          ) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          if (!node.postfix) {
            return {unlessParentBreaks: {visibleType: 'assignment'}}
          }
          return false
        case 'SpreadElement':
        case 'JSXSpreadAttribute':
          return true
        default:
          return false
      }
    case 'SwitchStatement':
      switch (parent.type) {
        case 'SpreadElement':
        case 'JSXSpreadAttribute':
          return true
        default:
          return false
      }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      if (isPostfixForBody(path)) {
        return true
      }
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
        case 'BinaryExpression':
        case 'LogicalExpression':
          return node === parent.left
        default:
          return false
      }
    case 'ClassExpression':
      if (isCondition(node, parent)) {
        return {unlessParentBreaks: true}
      }
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
        (parent.type === 'UnaryExpression' && parent.operator === 'typeof')
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
        case 'SpreadElement':
        case 'JSXSpreadAttribute':
          return true
        case 'BinaryExpression':
        case 'LogicalExpression':
          return node === parent.left
        case 'UnaryExpression':
          return !parent.prefix
        case 'IfStatement':
        case 'ConditionalExpression':
        case 'WhileStatement':
          if (node === parent.test) {
            if (!parent.postfix) {
              return {unlessParentBreaks: true}
            }
            if (node.handler) {
              return {unlessParentBreaks: true}
            }
          }
          return false
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

function isCondition(node, parent) {
  return (
    ((isIf(parent) || parent.type === 'WhileStatement') &&
      parent.test === node) ||
    (parent.type === 'SwitchStatement' && parent.discriminant === node)
  )
}

function isAmbiguousRegex(node) {
  const pattern =
    node.originalPattern != null ? node.originalPattern : node.pattern
  return (
    node.type === 'RegExpLiteral' &&
    pattern &&
    /^=?\s+/.test(pattern) &&
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
      needsParens.unlessParentBreaks
        ? ifBreak('', '(', {
            visibleType:
              needsParens.unlessParentBreaks.visibleType || 'visible',
          })
        : '('
    )
  }

  parts.push(linesWithoutParens)

  if (needsParens) {
    parts.push(
      needsParens.unlessParentBreaks
        ? ifBreak('', ')', {
            visibleType:
              needsParens.unlessParentBreaks.visibleType || 'visible',
          })
        : ')'
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

      parts.push(
        comments.printDanglingComments(path, options, /* sameIndent */ true)
      )

      if (n.body.length || n.comments) {
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
        parent.type === 'ClassProperty' ||
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
    case 'ObjectProperty': {
      const parent = path.getParentNode()
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
        const respectBreak =
          options.respectBreak.indexOf('object') > -1 &&
          parent.type === 'ObjectExpression' &&
          util.hasNewlineInRange(
            options.originalText,
            options.locStart(n),
            options.locEnd(n)
          )
        const unsafeInline =
          n !== util.getLast(parent.properties) && isFunction(n.value) // TODO: anything else that could end in a function or implicit call?
        const shouldBreak = respectBreak || unsafeInline
        parts.push(
          printAssignment(
            n.key,
            printedLeft,
            ':',
            n.value,
            [path, print, 'value'],
            options,
            {shouldBreak}
          )
        )
      }

      return concat(parts)
    }
    case 'ClassMethod':
      if (n.static) {
        parts.push(n.staticClassName ? `${n.staticClassName}.` : '@')
      }

      parts = parts.concat(printObjectMethod(path, options, print))

      return concat(parts)
    case 'ArrayExpression':
    case 'ArrayPattern': {
      if (n.elements.length === 0) {
        if (!hasDanglingComments(n)) {
          return '[]'
        }
        return group(
          concat([
            '[',
            comments.printDanglingComments(path, options),
            softline,
            ']',
          ])
        )
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
          {visibleType: 'visible'}
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
    case 'InterpolatedRegExpLiteral':
    case 'RegExpLiteral':
      return printRegex(path, options, print)
    case 'PassthroughLiteral': {
      const quote = n.here ? '```' : '`'
      parts.push(quote, n.value, quote)
      return concat(parts)
    }
    case 'Identifier':
      return concat([n.name])
    case 'MemberExpression': {
      const parent = path.getParentNode()
      const shouldInline =
        n.computed ||
        isThisLookup(n) ||
        (n.object.type === 'Identifier' &&
          n.property.type === 'Identifier' &&
          parent.type !== 'MemberExpression')

      const nonInlinedContent = concat([
        softline,
        printMemberLookup(path, options, print),
      ])

      return concat([
        path.call(print, 'object'),
        shouldInline
          ? printMemberLookup(path, options, print)
          : group(
              options.indentChain
                ? indent(nonInlinedContent)
                : nonInlinedContent
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
    case 'ArrowFunctionExpression':
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
    case 'Import':
      return 'import'
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
          ((parent.type === 'WhileStatement' || parent.type === 'For') &&
            n === parent.body))
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

      if (
        !hasContent &&
        ((parent.type === 'WhileStatement' || parent.type === 'For') &&
          n === parent.body)
      ) {
        parts.push(indent(concat([hardline, ';'])))
      }
      return concat(parts)
    }
    case 'ReturnStatement':
      parts.push('return')

      if (n.argument) {
        const shouldBreak =
          n.argument.type === 'JSXElement' || isBinaryish(n.argument)
        if (returnArgumentHasLeadingComment(options, n.argument)) {
          parts.push(
            concat([
              ' (',
              indent(concat([hardline, path.call(print, 'argument')])),
              hardline,
              ')',
            ])
          )
        } else if (shouldBreak) {
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
      const {operator, prefix} = n
      if (prefix) {
        parts.push(operator)

        if (/[a-z]$/.test(operator)) {
          parts.push(' ')
        }
      }

      parts.push(path.call(print, 'argument'))
      if (!prefix) parts.push(operator)

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
      const parent = path.getParentNode()
      const simpleTest = path.call(print, 'test')
      const breakingTest = group(
        concat([
          ifBreak('('),
          indent(concat([softline, simpleTest])),
          softline,
          ifBreak(')'),
        ]),
        {visibleType: 'visible'}
      )
      const keyword = n.inverted ? 'unless ' : 'if '
      const dontBreakTest =
        n.test.type === 'CallExpression' ||
        (isDoFunc(n.test) && n.postfix) ||
        (n.test.type === 'BinaryExpression' &&
          n.test.right.type === 'ArrayExpression')
      const test = dontBreakTest ? simpleTest : breakingTest

      if (n.postfix) {
        const {path: singleExprPath} = singleExpressionBlock(n.consequent, {
          withPath: true,
        })
        parts.push(
          singleExprPath
            ? path.call(print, 'consequent', ...singleExprPath)
            : path.call(print, 'consequent'),
          ' '
        )
        parts.push(keyword, test)
        return concat(parts)
      }

      const shouldBreak = shouldBreakIf(n, options)
      const needsParens = pathNeedsParens(path, options)
      const shouldIndent = needsParens && !needsParens.unlessParentBreaks

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
        const commentOnOwnLine =
          (hasTrailingComment(n.consequent) &&
            n.consequent.comments.some(
              comment =>
                comment.trailing && !handleComments.isBlockComment(comment)
            )) ||
          needsHardlineAfterDanglingComment(n)
        if (hasDanglingComments(n)) {
          parts.push(
            commentOnOwnLine ? hardline : line,
            comments.printDanglingComments(path, options, /* sameIndent */ true)
          )
        }
        const alternate = path.call(print, 'alternate')
        const hasChainedElseIf = isIf(n.alternate)
        const alt = hasChainedElseIf
          ? concat([' ', alternate])
          : adjustClause(n.alternate, alternate)
        parts.push(
          commentOnOwnLine ? hardline : line,
          'else',
          n.consequent.type === 'BlockStatement' && !hasChainedElseIf
            ? ' '
            : '',
          alt
        )
      }

      const isChainedElseIf = parent.type === n.type && n === parent.alternate
      const indentedContent = concat([indent(concat(parts)), softline])
      const unindentedContent = concat(parts)
      const content = shouldIndent ? indentedContent : unindentedContent
      if (isChainedElseIf) {
        return content
      }
      return group(content, {shouldBreak})
    }
    case 'For': {
      const printedSource = path.call(print, 'source')

      const sourceClosesOwnIndentWhenBreaking = path.call(
        sourcePath => closesOwnIndentWhenBreaking(sourcePath),
        'source'
      )
      const source = sourceClosesOwnIndentWhenBreaking
        ? printedSource
        : group(
            concat([
              ifBreak('('),
              indent(concat([softline, printedSource])),
              softline,
              ifBreak(')'),
            ])
          )
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
        source,
        n.step ? concat([' by ', path.call(print, 'step')]) : '',
        n.guard
          ? concat([
              ' when ',
              group(
                concat([
                  ifBreak('('),
                  indent(concat([softline, path.call(print, 'guard')])),
                  softline,
                  ifBreak(')'),
                ])
              ),
            ])
          : '',
      ])

      if (n.postfix) {
        const {path: singleExprPath} = singleExpressionBlock(n.body, {
          withPath: true,
        })
        parts.push(
          singleExprPath
            ? path.call(print, 'body', ...singleExprPath)
            : path.call(print, 'body'),
          ' '
        )
        parts.push(opening)
        return concat(parts)
      }

      const needsParens = pathNeedsParens(path, options)
      const shouldIndent = needsParens && !needsParens.unlessParentBreaks

      if (shouldIndent) {
        parts.push(softline)
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

      const indentedContent = concat([indent(concat(parts)), softline])
      const unindentedContent = concat(parts)
      const content = shouldIndent ? indentedContent : unindentedContent

      return group(content, {shouldBreak})
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
        ]),
        {visibleType: 'visible'}
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

      const body = adjustClause(n.body, path.call(print, 'body'))

      const needsParens = pathNeedsParens(path, options)
      const shouldIndent = needsParens && !needsParens.unlessParentBreaks

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
      const needsParens = pathNeedsParens(path, options)
      const shouldIndent = needsParens && !needsParens.unlessParentBreaks

      const content = concat([
        shouldIndent ? softline : '',
        'try',
        ifBreak(
          '',
          (!n.block || isEmptyBlock(n.block)) && (n.handler || n.finalizer)
            ? ''
            : ' '
        ),
        path.call(print, 'block'),
        isNextLineEmpty(text, n.block, locEnd) && (n.handler || n.finalizer)
          ? hardline
          : '',
        n.handler
          ? concat([
              line,
              path.call(print, 'handler'),
              isNextLineEmpty(text, n.handler, locEnd) && n.finalizer
                ? hardline
                : '',
            ])
          : '',
        n.finalizer
          ? concat([
              line,
              'finally',
              ifBreak('', ' '),
              path.call(print, 'finalizer'),
            ])
          : '',
      ])

      const shouldBreak =
        options.respectBreak.indexOf('control') > -1 &&
        (!hasSameStartLine(n, n.block) ||
          (n.handler && !hasSameStartLine(n, n.handler)))

      return group(
        shouldIndent ? concat([indent(content), softline]) : content,
        {shouldBreak}
      )
    }
    case 'CatchClause': {
      const shouldBreak =
        options.respectBreak.indexOf('control') > -1 &&
        !hasSameStartLine(n, n.body)

      return group(
        concat([
          'catch',
          n.param ? concat([' ', path.call(print, 'param')]) : '',
          ifBreak('', n.body && !isEmptyBlock(n.body) ? ' then ' : ''),
          path.call(print, 'body'),
        ]),
        {shouldBreak}
      )
    }
    case 'ThrowStatement':
      return concat(['throw ', path.call(print, 'argument')])
    case 'SwitchStatement': {
      const needsParens = pathNeedsParens(path, options)
      const shouldIndent = needsParens && !needsParens.unlessParentBreaks

      if (shouldIndent) {
        parts.push(softline)
      }
      parts.push('switch')
      if (n.discriminant) {
        const simpleDiscriminant = path.call(print, 'discriminant')
        const breakingDiscriminant = group(
          concat([
            ifBreak('('),
            indent(concat([softline, simpleDiscriminant])),
            softline,
            ifBreak(')'),
          ]),
          {visibleType: 'visible'}
        )
        const dontBreakDiscriminant = n.discriminant.type === 'CallExpression'
        const discriminant = dontBreakDiscriminant
          ? simpleDiscriminant
          : breakingDiscriminant
        parts.push(' ', discriminant)
      }
      const groupedCases = []
      let currentGroup = []
      let currentGroupPrintedLeadingComments = null
      let currentGroupPrintedTrailingComments = null
      let currentGroupCasePath = null
      const printConsequent = (
        casePath,
        {isElse, printedTrailingComments} = {}
      ) => {
        const kase = casePath.getValue()
        const shouldBreak =
          kase.consequent.length !== 1 ||
          (options.respectBreak.indexOf('control') > -1 &&
            !hasSameStartLine(kase, kase.consequent[0]))

        return concat([
          group(
            concat([
              indent(
                concat([
                  ifBreak(line, isElse ? ' ' : ' then '),
                  !kase.consequent.length
                    ? ';'
                    : casePath.call(
                        consequentPath =>
                          printStatementSequence(
                            consequentPath,
                            options,
                            print
                          ),
                        'consequent'
                      ),
                ])
              ),
              printedTrailingComments || '',
            ]),
            {shouldBreak}
          ),
          n.cases.indexOf(kase) !== n.cases.length - 1 &&
          isNextLineEmpty(options.originalText, kase, options.locEnd)
            ? hardline
            : '',
        ])
      }
      path.map(casePath => {
        currentGroupCasePath = casePath
        const kase = casePath.getValue()
        if (kase.comments && kase.comments.find(({leading}) => leading)) {
          const allComments = kase.comments
          kase.comments = kase.comments.filter(({leading}) => leading)
          currentGroupPrintedLeadingComments = comments.printComments(
            casePath,
            () => '',
            options
          )
          kase.comments = allComments
        }
        if (kase.comments && kase.comments.find(({trailing}) => trailing)) {
          const allComments = kase.comments
          kase.comments = kase.comments.filter(({trailing}) => trailing)
          currentGroupPrintedTrailingComments = comments.printComments(
            casePath,
            () => '',
            options
          )
          kase.comments = allComments
        }
        if (kase.test) {
          currentGroup.push(casePath.call(print, 'test'))
          if (kase.trailing || (kase.consequent && kase.consequent.length)) {
            groupedCases.push({
              cases: currentGroup,
              // consequent: adjustClause(
              //   kase.consequent,
              //   casePath.call(print, 'consequent')
              // ),
              consequent: printConsequent(casePath, {
                printedTrailingComments: currentGroupPrintedTrailingComments,
              }),
              printedLeadingComments: currentGroupPrintedLeadingComments,
              casePath: currentGroupCasePath,
            })
            currentGroup = []
            currentGroupPrintedLeadingComments = null
            currentGroupPrintedTrailingComments = null
          }
        } else {
          // default should be last case
          groupedCases.push({
            consequent: printConsequent(casePath, {
              isElse: true,
              printedTrailingComments: currentGroupPrintedTrailingComments,
            }),
            printedLeadingComments: currentGroupPrintedLeadingComments,
            casePath: currentGroupCasePath,
          })
        }
      }, 'cases')
      const body = []
      const lastIndex = groupedCases.length - 1
      groupedCases.forEach((groupedCase, i) => {
        const caseBody = []
        if (groupedCase.printedLeadingComments) {
          caseBody.push(groupedCase.printedLeadingComments)
        }
        if (groupedCase.cases) {
          caseBody.push('when ')
          caseBody.push(join(', ', groupedCase.cases))
        } else {
          caseBody.push('else')
        }
        caseBody.push(
          // concat([groupedCase.consequent, i !== lastIndex ? hardline : ''])
          groupedCase.consequent
        )
        if (i !== lastIndex) {
          caseBody.push(hardline)
        }
        body.push(...caseBody)
      })
      parts.push(group(indent(concat([hardline, ...body]))))
      const indentedContent = concat([indent(concat(parts)), softline])
      const unindentedContent = concat(parts)
      return shouldIndent ? indentedContent : unindentedContent
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
        n.expression.type === 'ArrayExpression' ||
        n.expression.type === 'ObjectExpression' ||
        n.expression.type === 'CallExpression' ||
        isFunction(n.expression) ||
        n.expression.type === 'JSXEmptyExpression' ||
        n.expression.type === 'TemplateLiteral' ||
        n.expression.type === 'TaggedTemplateExpression' ||
        (isJSXNode(parent) && (isIf(n.expression) || isBinaryish(n.expression)))

      if (shouldInline) {
        return group(
          concat([
            '{',
            path.call(print, 'expression'),
            shouldInlineButStillClosingLinebreak ? softline : '',
            // lineSuffixBoundary,
            '}',
          ])
        )
      }

      return group(
        concat([
          '{',
          indent(concat([softline, path.call(print, 'expression')])),
          softline,
          // lineSuffixBoundary,
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
      const nameHasComments =
        n.name && n.name.comments && n.name.comments.length > 0

      if (n.selfClosing && !n.attributes.length && !nameHasComments) {
        return concat(['<', path.call(print, 'name'), ' />'])
      }

      if (
        n.attributes &&
        n.attributes.length === 1 &&
        n.attributes[0].value &&
        isStringLiteral(n.attributes[0].value) &&
        // !n.attributes[0].value.value.includes("\n") &&
        !nameHasComments &&
        (!n.attributes[0].comments || !n.attributes[0].comments.length)
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

      const lastAttrHasTrailingComments =
        n.attributes.length && hasTrailingComment(getLast(n.attributes))

      const bracketSameLine =
        options.jsxBracketSameLine &&
        (!nameHasComments || n.attributes.length) &&
        !lastAttrHasTrailingComments

      // const shouldBreak = n.attributes && n.attributes.some(attr => attr.value && isStringLiteral(attr.value) && attr.value.value.includes("\n"))

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
        ]),
        // {shouldBreak}
        {}
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
    case 'JSXEmptyExpression': {
      const requiresHardline =
        n.comments && !n.comments.every(handleComments.isBlockComment)

      return concat([
        comments.printDanglingComments(
          path,
          options,
          /* sameIndent */ !requiresHardline
        ),
        requiresHardline ? hardline : '',
      ])
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
    case 'ClassProperty': {
      const leftParts = []
      if (n.static) {
        leftParts.push('@')
      }

      if (n.computed) {
        leftParts.push('[', path.call(print, 'key'), ']')
      } else {
        leftParts.push(printPropertyKey(path, options, print))
      }
      if (n.operator === '=') leftParts.push(' ')
      const printedLeft = concat(leftParts)

      parts.push(
        printAssignment(
          n.key,
          printedLeft,
          n.operator,
          n.value,
          [path, print, 'value'],
          options
        )
      )
      // parts.push(
      //   n.operator === ':' ? ':' : ' =',
      //   printAssignmentRight(n.value, path.call(print, 'value'), options, true)
      // )

      // return group(concat(parts))
      return concat(parts)
    }
    case 'ClassDeclaration':
    case 'ClassExpression':
      parts.push(concat(printClass(path, options, print)))
      return concat(parts)
    case 'TemplateElement':
      return join(literalline, n.value.raw.split(/\r?\n/g))
    case 'TemplateLiteral':
      return printTemplateLiteral(path, options, print)
    case 'EmptyInterpolation':
      return ''
    case 'TaggedTemplateExpression':
      return concat([path.call(print, 'tag'), path.call(print, 'quasi')])
    default:
      throw new Error('unknown type: ' + JSON.stringify(n.type))
  }
}

function closesOwnIndentWhenBreaking(path) {
  const node = path.getValue()
  switch (node.type) {
    case 'ArrayExpression':
    case 'CallExpression':
      return true
    case 'MemberExpression':
      return node.computed && node.property.type !== 'Range'
  }
  return false
}

function returnArgumentHasLeadingComment(options, argument) {
  if (hasLeadingOwnLineComment(options.originalText, argument, options)) {
    return true
  }

  if (hasNakedLeftSide(argument)) {
    let leftMost = argument
    let newLeftMost
    while ((newLeftMost = getLeftSide(leftMost))) {
      leftMost = newLeftMost

      if (hasLeadingOwnLineComment(options.originalText, leftMost, options)) {
        return true
      }
    }
  }

  return false
}

function hasLeadingOwnLineComment(text, node, options) {
  const res =
    node.comments &&
    node.comments.some(
      comment =>
        comment.leading && util.hasNewline(text, options.locEnd(comment))
    )
  return res
}

function hasNakedLeftSide(node) {
  return (
    node.type === 'AssignmentExpression' ||
    node.type === 'BinaryExpression' ||
    node.type === 'LogicalExpression' ||
    (node.type === 'UnaryExpression' && node.prefix) ||
    node.type === 'CallExpression' ||
    node.type === 'MemberExpression' ||
    node.type === 'SequenceExpression' ||
    node.type === 'TaggedTemplateExpression' ||
    (node.type === 'UpdateExpression' && !node.prefix)
  )
}

function getLeftSide(node) {
  if (node.expressions) {
    return node.expressions[0]
  }
  return (
    node.left ||
    node.test ||
    node.callee ||
    node.object ||
    node.tag ||
    node.argument ||
    node.expression
  )
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

  const preParamsDanglingCommentFilter = comment =>
    getNextNonSpaceNonCommentCharacter(
      options.originalText,
      comment,
      options.locEnd
    ) === '('
  parts.push(
    comments.printDanglingComments(
      path,
      options,
      /* sameIndent */ true,
      preParamsDanglingCommentFilter
    ),
    hasDanglingComments(node, preParamsDanglingCommentFilter) ? ' ' : ''
  )

  parts.push(group(printFunctionParams(path, print, options)))

  const postParamsDanglingCommentFilter = comment =>
    getNextNonSpaceNonCommentCharacter(
      options.originalText,
      comment,
      options.locEnd
    ) === '-'
  parts.push(
    comments.printDanglingComments(
      path,
      options,
      /* sameIndent */ true,
      postParamsDanglingCommentFilter
    ),
    hasDanglingComments(node, postParamsDanglingCommentFilter) ? ' ' : ''
  )

  parts.push(
    node.bound || node.type === 'ArrowFunctionExpression' ? '=>' : '->'
  )

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
      (singleExpr.type === 'ObjectExpression' &&
        path.call(
          objectPath => objectRequiresBraces(objectPath, options),
          'body',
          ...singleExprPath
        )) ||
      isFunction(singleExpr))
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
        ? ifBreak('', softline, {visibleType: 'visible', offset: 1})
        : softline
      : needsParens
      ? needsParens.unlessParentBreaks
        ? ifBreak('', softline, {visibleType: 'visible'})
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
    if (!hasDanglingComments(node)) {
      return concat(['{', '}'])
    }

    return {
      content: group(
        concat([
          '{',
          comments.printDanglingComments(path, options),
          softline,
          '}',
        ])
      ),
      groupOptions: {},
    }
  }

  const shouldOmitBraces =
    shouldOmitObjectBraces(path, options) ||
    (!objectRequiresBraces(path, options) &&
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
      // props.length > 1 &&
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
      ? ifBreak(dontIndent.ifParentBreaks ? '' : softline, bracketSpacingLine, {
          visibleType: 'visible',
          offset: 1,
        })
      : bracketSpacingLine,
    concat(joinedProps),
  ])
  const content = concat([
    shouldOmitBracesIfParentBreaks
      ? ifBreak('', '{', {visibleType: 'visible', offset: 1})
      : shouldOmitBraces
      ? ''
      : shouldOmitBracesUnlessBreaks
      ? ifBreak('{', '', {visibleType: 'visible'})
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
        ? ifBreak('', line, {visibleType: 'visible', offset: 1})
        : line,
      shouldOmitBracesIfParentBreaks
        ? ifBreak('', '}', {visibleType: 'visible', offset: 1})
        : shouldOmitBraces
        ? ''
        : shouldOmitBracesUnlessBreaks
        ? ifBreak('}', '', {visibleType: 'visible'})
        : '}',
    ]),
  ])
  return {
    content,
    groupOptions: {
      shouldBreak,
      visibleType: 'visible',
      shouldBreakIfVisibleTypeBroke: shouldBreakIfParentBreaks,
    },
  }
}

function isClass(node) {
  return (
    node &&
    (node.type === 'ClassExpression' || node.type === 'ClassDeclaration')
  )
}

function printTemplateLiteral(path, options, print, {omitQuotes} = {}) {
  const parts = []
  const node = path.getValue()
  const expressions = path.map(print, 'expressions')
  const quote = omitQuotes
    ? ''
    : options.singleQuote &&
      node.quote === '"""' &&
      node.expressions.length === 0 &&
      !node.quasis.find(quasi => /'''/.test(quasi.value.raw)) &&
      !(
        node.quasis.length &&
        /'$/.test(node.quasis[node.quasis.length - 1].value.raw)
      )
    ? "'''"
    : !options.singleQuote &&
      node.quote === "'''" &&
      !node.quasis.find(quasi => /("""|#\{)/.test(quasi.value.raw)) &&
      !(
        node.quasis.length &&
        /"$/.test(node.quasis[node.quasis.length - 1].value.raw)
      )
    ? '"""'
    : node.quote || '"'
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
        (node.expressions[i].comments && node.expressions[i].comments.length) ||
        node.expressions[i].type === 'MemberExpression' ||
        node.expressions[i].type === 'ConditionalExpression'
      ) {
        printed = concat([indent(concat([softline, printed])), softline])
      } else if (node.expressions[i].type === 'BlockStatement') {
        printed = concat([printed, softline])
      }

      // const aligned = addAlignmentToDoc(printed, indentSize, tabWidth)

      parts.push(group(concat(['#{', printed, lineSuffixBoundary, '}'])))
    }
  }, 'quasis')

  parts.push(quote)

  return concat(parts)
}

function isChainableCall(node) {
  return node.type === 'CallExpression' && isMemberish(node.callee)
}

function printRegex(path, options, print) {
  const node = path.getValue()
  const delim = node.delimiter || '/'
  const flags = node.flags
    .split('')
    .sort()
    .join('')
  const pattern = node.interpolatedPattern
    ? path.call(
        patternPath =>
          printTemplateLiteral(patternPath, options, print, {omitQuotes: true}),
        'interpolatedPattern'
      )
    : node.originalPattern != null
    ? node.originalPattern
    : node.pattern
  return concat([delim, pattern, delim, flags])
}

function singleExpressionBlock(node, {withPath} = {}) {
  if (!(node.type === 'BlockStatement' && node.body.length === 1)) {
    return withPath ? {} : false
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
    isFunction(greatgrandparent) &&
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

function isExplicitObject(node, options) {
  return options.originalText.charAt(options.locStart(node)) === '{'
}

function objectRequiresBraces(path, options, {stackOffset = 0} = {}) {
  if (options.noImplicit.indexOf('objectBraces') > -1) {
    return true
  }
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
  if (
    options.respectExplicit.indexOf('objectBraces') > -1 &&
    isExplicitObject(node, options)
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

function isPostfixIfConsequent(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  const greatgrandparent = path.getParentNode(stackOffset + 2)

  if (isIf(parent, {postfix: true}) && node === parent.consequent) {
    return true
  }

  if (
    singleExpressionBlock(parent) &&
    isIf(grandparent, {postfix: true}) &&
    parent === grandparent.consequent
  ) {
    return true
  }

  if (
    parent.type === 'ExpressionStatement' &&
    singleExpressionBlock(grandparent) &&
    isIf(greatgrandparent, {postfix: true}) &&
    grandparent === greatgrandparent.consequent
  ) {
    return true
  }

  return false
}

function isPostfixForBody(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  const greatgrandparent = path.getParentNode(stackOffset + 2)

  if (isFor(parent, {postfix: true}) && node === parent.body) {
    return true
  }

  if (
    singleExpressionBlock(parent) &&
    isFor(grandparent, {postfix: true}) &&
    parent === grandparent.body
  ) {
    return true
  }

  if (
    parent.type === 'ExpressionStatement' &&
    singleExpressionBlock(grandparent) &&
    isFor(greatgrandparent, {postfix: true}) &&
    grandparent === greatgrandparent.body
  ) {
    return true
  }

  return false
}

function isPostfixWhileBody(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  const greatgrandparent = path.getParentNode(stackOffset + 2)

  if (isWhile(parent, {postfix: true}) && node === parent.body) {
    return true
  }

  if (
    singleExpressionBlock(parent) &&
    isWhile(grandparent, {postfix: true}) &&
    parent === grandparent.body
  ) {
    return true
  }

  if (
    parent.type === 'ExpressionStatement' &&
    singleExpressionBlock(grandparent) &&
    isWhile(greatgrandparent, {postfix: true}) &&
    grandparent === greatgrandparent.body
  ) {
    return true
  }

  return false
}

function isPostfixBody(path, {stackOffset = 0} = {}) {
  return (
    isPostfixIfConsequent(path, {stackOffset}) ||
    isPostfixForBody(path, {stackOffset}) ||
    isPostfixWhileBody(path, {stackOffset})
  )
}

// eslint-disable-next-line no-unused-vars
function isTryBody(path, {stackOffset = 0} = {}) {
  const node = path.getParentNode(stackOffset - 1)
  const parent = path.getParentNode(stackOffset)
  const grandparent = path.getParentNode(stackOffset + 1)
  const greatgrandparent = path.getParentNode(stackOffset + 2)

  if (parent.type === 'TryStatement' && node === parent.block) {
    return true
  }

  if (
    singleExpressionBlock(parent) &&
    grandparent.type === 'TryStatement' &&
    parent === grandparent.block
  ) {
    return true
  }

  if (
    parent.type === 'ExpressionStatement' &&
    singleExpressionBlock(grandparent) &&
    greatgrandparent.type === 'TryStatement' &&
    grandparent === greatgrandparent.block
  ) {
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

  if (objectRequiresBraces(path, options, {stackOffset})) {
    return false
  }

  if (isPostfixIfConsequent(path, {stackOffset})) {
    return false
  }

  if (
    parent.type === 'ReturnStatement' &&
    isPostfixIfConsequent(path, {stackOffset: stackOffset + 1})
  ) {
    return unlessBreaks
  }

  if (isPostfixForBody(path, {stackOffset})) {
    return false
  }

  if (
    parent.type === 'CallExpression' &&
    node !== parent.callee &&
    trailingObjectIsntOptions(parent.callee)
  ) {
    return ifParentBreaks
  }

  if (
    parent.type === 'ArrayExpression' &&
    node === getLast(parent.elements) &&
    parent.elements.length > 1
  ) {
    return ifParentBreaks ? {indent: false} : false
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

function isFollowedByIndentedBody(node, parent) {
  return (
    (isIf(parent) ||
      parent.type === 'WhileStatement' ||
      parent.type === 'SwitchStatement' ||
      parent.type === 'ClassExpression' ||
      parent.type === 'For') &&
    !parent.postfix
  )
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
  let setIndent = false
  let indent = false
  let trailingLine
  let breakingParentCount = 0
  let isFollowedByComma = false
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
      (parent.type === 'SwitchCase' && prevParent === parent.test) ||
      (parent.type === 'For' &&
        (prevParent === parent.source || prevParent === parent.guard)) ||
      (parent.type === 'WhileStatement' && prevParent === parent.test) ||
      (parent.type === 'ClassExpression' &&
        prevParent === parent.superClass &&
        ((parent.body && parent.body.body.length) ||
          isBlockLevel(parent, grandparent))) ||
      parent.type === 'SequenceExpression' ||
      (parent.type === 'ClassProperty' && node === parent.value) ||
      (parent.type === 'MemberExpression' &&
        prevParent === parent.property &&
        parent.computed) ||
      (parent.type === 'ArrayExpression' && node === getLast(parent.elements))
    ) {
      return {
        indent,
        trailingLine,
        isFollowedByIndentedBody: isFollowedByIndentedBody(node, parent),
        isFollowedByComma,
      }
    }
    if (
      ifParentBreaks &&
      (isCallArgument(path, {
        nonLast: true,
        stackOffset: stackOffset + parentLevel,
      }) ||
        isObjectPropertyValue(path, {
          stackOffset: stackOffset + parentLevel,
          nonLast: true,
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
      return {
        indent,
        trailingLine,
        ifParentBreaks: true,
        breakingParentCount,
        isFollowedByComma:
          (isCallArgument(path, {
            nonLast: true,
            stackOffset: stackOffset + parentLevel,
          }) &&
            options.comma !== 'none') ||
          (parent.type === 'ArrayExpression' &&
            options.comma !== 'none' &&
            (node !== getLast(parent.elements) || options.comma === 'all')),
      }
    }
    if (parent.type === 'AssignmentExpression' || isBinaryish(parent)) {
      if (prevParent !== parent.right) {
        return false
      }
      if (parent.type !== 'AssignmentExpression') {
        if (!setIndent) {
          indent = true
        }
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
      if (!setIndent) {
        indent = true
      }
      trailingLine = grandparent.type !== 'BlockStatement'
    } else if (
      isCallArgument(path, {
        last: true,
        stackOffset: stackOffset + parentLevel,
      })
    ) {
      indent = false
      setIndent = true
      trailingLine = false
      if (options.comma === 'all') {
        isFollowedByComma = true
      }
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
      (parent.type === 'UnaryExpression' && parent.prefix) ||
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

function isFor(node, {postfix} = {}) {
  return node && node.type === 'For' && (!postfix || node.postfix)
}

function isWhile(node, {postfix} = {}) {
  return node && node.type === 'WhileStatement' && (!postfix || node.postfix)
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

function needsHardlineAfterDanglingComment(node) {
  if (!node.comments) {
    return false
  }
  const lastDanglingComment = util.getLast(
    node.comments.filter(comment => !comment.leading && !comment.trailing)
  )
  return (
    lastDanglingComment && !handleComments.isBlockComment(lastDanglingComment)
  )
}

function printExportDeclaration(path, options, print) {
  const decl = path.getValue()
  const parts = ['export ']

  if (decl['default'] || decl.type === 'ExportDefaultDeclaration') {
    parts.push('default ')
  }

  parts.push(
    comments.printDanglingComments(path, options, /* sameIndent */ true)
  )

  if (needsHardlineAfterDanglingComment(decl)) {
    parts.push(hardline)
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
  if (!(node.type === 'LogicalExpression')) {
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

  if (isFunction(node.right)) {
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
        printed: comments.printComments(
          path,
          () =>
            concat([
              printOptionalToken(path),
              printArgumentsList(path, options, print),
            ]),
          options
        ),
      })
      path.call(callee => rec(callee), 'callee')
    } else if (isMemberish(node)) {
      printedNodes.unshift({
        node,
        printed: comments.printComments(
          path,
          () => printMemberLookup(path, options, print),
          options
        ),
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

    // if (node.comments && node.comments.some(comment => comment.trailing)) {
    //   groups.push(currentGroup)
    //   currentGroup = []
    //   hasSeenCallExpression = false
    // }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  function isFactory(name) {
    return name.match(/(^[A-Z])|^[_$]+$/)
  }

  const shouldMerge =
    groups.length >= 2 &&
    // !groups[1][0].node.comments &&
    (groups[0].length === 1 &&
      (groups[0][0].node.type === 'ThisExpression' ||
        (groups[0][0].node.type === 'Identifier' &&
          isFactory(groups[0][0].node.name))))

  function printGroup(printedGroup, {shouldBlockVisible} = {}) {
    const printed = concat(printedGroup.map(tuple => tuple.printed))
    return shouldBlockVisible ? blockVisible(printed) : printed
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
    printGroup(group, {shouldBlockVisible: i !== lastIndex})
  )
  const oneLine = concat(printedGroups)

  const cutoff = shouldMerge ? 3 : 2
  const flatGroups = groups
    .slice(0, cutoff)
    .reduce((res, group) => res.concat(group), [])

  const hasComment =
    flatGroups.slice(1, -1).some(node => hasLeadingComment(node.node)) ||
    // flatGroups.slice(0, -1).some(node => hasTrailingComment(node.node)) ||
    (groups[cutoff] && hasLeadingComment(groups[cutoff][0].node))

  if (groups.length <= cutoff && !hasComment) {
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
    hasComment ||
    callExpressionCount >= 3 ||
    (callExpressionCount === 2 &&
      callExpressions.some(({node}) =>
        node.arguments.some(argument => isFunction(argument))
      )) ||
    printedGroups.slice(0, -1).some(willBreak)
  ) {
    return group(expanded, {visibleType: 'visible'})
  }

  return concat([
    willBreak(oneLine) ? breakParent : '',
    conditionalGroup([oneLine, expanded], {visibleType: 'visible'}),
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
  if (operator === '?' && node.type === 'LogicalExpression') {
    return '??'
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
    // const canonicalOperator = getCanonicalOperator(node)

    canBreak =
      !isIf(node.right) &&
      !(node.right.type === 'ArrayExpression' && node.right.elements.length) && // TODO: others?
      !shouldInlineLogicalExpression(node, {notJSX: true}) &&
      !isTemplateOnItsOwnLine(node.right, options.originalText, options)
    const right = concat([
      operator,
      canBreak ? line : ' ',
      path.call(print, 'right'),
    ])

    const parent = path.getParentNode()
    const shouldGroup =
      parent.type !== node.type &&
      node.left.type !== node.type &&
      node.right.type !== node.type

    parts.push(' ', shouldGroup ? group(right) : right)

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
    node === getPenultimate(args) && isFunction(getLast(args))
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
  if (callParensNecessary(path, options, {stackOffset})) {
    return false
  }

  let isRightmost
  return (
    (isRightmost = isRightmostInStatement(path, options, {
      stackOffset,
      ifParentBreaks: true,
    })) &&
    !isRightmost.isFollowedByComma &&
    isRightmost
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
    node.type === 'CallExpression' &&
    node.callee.type !== 'MemberExpression' &&
    parent.type === 'MemberExpression' &&
    node === parent.object &&
    grandparent.type === 'CallExpression' &&
    parent === grandparent.callee
  )
}

function isExplicitCall(node, options) {
  return options.originalText.charAt(options.locEnd(node.callee)) === '('
}

function callParensNecessary(path, options, {stackOffset = 0} = {}) {
  if (options.noImplicit.indexOf('callParens') > -1) {
    return true
  }
  const node = path.getParentNode(stackOffset - 1)

  if (
    options.respectExplicit.indexOf('callParens') > -1 &&
    isExplicitCall(node, options)
  ) {
    return true
  }

  if (
    node.arguments &&
    node.arguments.length &&
    node.arguments[0].type === 'RegExpLiteral' &&
    isAmbiguousRegex(node.arguments[0])
  ) {
    return true
  }
  if (node.callee && node.callee.type === 'Import') {
    return true
  }
  if (
    node.callee &&
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

  if (callParensNecessary(path, options, {stackOffset})) {
    return false
  }

  const isRightmost = isRightmostInStatement(path, options, {stackOffset})
  if (isRightmost.isFollowedByComma) return {unlessParentBreaks: true}
  if (isRightmost) return isRightmost
  return (
    pathNeedsParens(path, options) ||
    isBlockLevel(node, parent) ||
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
  let parensNecessary = callParensNecessary(path, options)
  let parensOptional =
    !parensNecessary &&
    node.arguments.length &&
    (callParensOptional(path, options) ||
      // (parent.type === 'CallExpression' &&
      //   node === parent.arguments[parent.arguments.length - 1] &&
      //   callParensOptional(path, options, {stackOffset: 1})) ||
      (isBinaryish(parent) &&
        node === parent.right &&
        callParensOptional(path, options, {stackOffset: 1})))
  const parensOptionalIfParentBreaks =
    !parensNecessary &&
    !parensOptional &&
    callParensOptionalIfParentBreaks(path, options)
  let parensOptionalUnlessParentBreaks = false
  if (parensOptional.unlessParentBreaks) {
    parensOptional = false
    parensOptionalUnlessParentBreaks = true
  }
  // console.log({
  //   parensOptional,
  //   parensNecessary,
  //   parensOptionalIfParentBreaks,
  //   parensOptionalUnlessParentBreaks,
  // })

  const shouldntBreak =
    args.length === 1 &&
    (isFunction(args[0]) ||
      args[0].type === 'ArrayExpression' ||
      (args[0].type === 'ObjectExpression' &&
        path.call(
          objectPath => objectRequiresBraces(objectPath, options),
          'arguments',
          '0'
        )) ||
      isDoFunc(args[0])) &&
    !hasTrailingComment(args[0])
  const doesntHaveExplicitEndingBrace =
    shouldntBreak && (isFunction(args[0]) || isDoFunc(args[0]))
  if (
    doesntHaveExplicitEndingBrace &&
    parensOptional.isFollowedByIndentedBody
  ) {
    parensNecessary = true
    parensOptional = false
  }

  const firstArgIsObject =
    args.length >= 1 &&
    args[0].type === 'ObjectExpression' &&
    !path.call(
      objectPath => objectRequiresBraces(objectPath, options),
      'arguments',
      '0'
    )
  const isRightSideOfAssignment =
    (parent.type === 'AssignmentExpression' && node === parent.right) ||
    ((parent.type === 'ObjectProperty' || parent.type === 'ClassProperty') &&
      node === parent.value)
  const isPostfixIfBody =
    isPostfixIfConsequent(path) ||
    (parent.type === 'ReturnStatement' &&
      isPostfixIfConsequent(path, {stackOffset: 1}))

  const unnecessary =
    shouldntBreak ||
    (firstArgIsObject &&
      !isRightSideOfAssignment &&
      !isFollowedByIndentedBody(node, parent) &&
      !isPostfixIfBody)

  const parensUnnecessary = unnecessary && parensOptional
  const parensUnnecessaryIfParentBreaks =
    unnecessary && parensOptionalIfParentBreaks
  const parensUnnecessaryUnlessParentBreaks =
    unnecessary && parensOptionalUnlessParentBreaks
  // const nonFinalArgs = args.slice(0, args.length - 1)
  const shouldBreak = false
  // args.length > 1 && nonFinalArgs.find(arg => arg.type === 'ObjectExpression')
  const closingLinebreakAnyway =
    parensUnnecessary && parent.type === 'JSXExpressionContainer'

  const openingImplicitSpace =
    args.length === 1 &&
    path.call(argPath => pathNeedsParens(argPath, options), 'arguments', '0')
      ? ''
      : ' '
  const openingParen = parensUnnecessary
    ? openingImplicitSpace
    : parensOptionalUnlessParentBreaks
    ? ifBreak(
        '(',
        parensUnnecessaryUnlessParentBreaks
          ? openingImplicitSpace
          : ifBreak('(', openingImplicitSpace),
        {
          visibleType: 'visible',
          offset: parensOptionalUnlessParentBreaks.breakingParentCount || 1,
        }
      )
    : parensOptionalIfParentBreaks
    ? ifBreak(
        parensUnnecessaryIfParentBreaks
          ? openingImplicitSpace
          : ifBreak('(', openingImplicitSpace),
        '(',
        {
          visibleType: 'visible',
          offset: parensOptionalIfParentBreaks.breakingParentCount || 1,
        }
      )
    : parensOptional
    ? ifBreak('(', openingImplicitSpace)
    : '('
  const closingParen = parensUnnecessary
    ? closingLinebreakAnyway
      ? softline
      : ''
    : parensOptionalUnlessParentBreaks
    ? ifBreak(')', parensUnnecessaryUnlessParentBreaks ? ' ' : ifBreak(')'), {
        visibleType: 'visible',
        offset: parensOptionalUnlessParentBreaks.breakingParentCount || 1,
      })
    : parensOptionalIfParentBreaks
    ? ifBreak(parensUnnecessaryIfParentBreaks ? ' ' : ifBreak(')'), ')', {
        visibleType: 'visible',
        offset: parensOptionalIfParentBreaks.breakingParentCount || 1,
      })
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
          ? ifBreak('', softline, {visibleType: 'visible', offset: 1})
          : softline,
        closingParen,
      ]),
      // {shouldBreak: true, visibleType: 'visible'}
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
        printedExpanded = nonLastArgs.concat(
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
        visibleType: 'visible',
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
        visibleType: 'visible',
        firstBreakingIndex,
      }),
    ])
    if (!shouldGroupLast.ifParentBreaks) {
      return groupLastPrinted
    }
  }

  const printed = shouldntBreak
    ? group(
        concat([
          openingParen,
          concat(printedArguments),
          doesntHaveExplicitEndingBrace && parensNecessary ? softline : '',
          closingParen,
        ]),
        {
          visibleType: 'visible',
        }
      )
    : group(
        concat([
          openingParen,
          indent(concat([softline, concat(printedArguments)])),
          parensUnnecessary
            ? ''
            : parensUnnecessaryIfParentBreaks
            ? ifBreak('', softline, {visibleType: 'visible', offset: 1})
            : softline,
          closingParen,
        ]),
        {visibleType: 'visible', shouldBreak}
      )
  return groupLastPrinted
    ? ifBreak(groupLastPrinted, printed, {visibleType: 'visible'})
    : printed
}

function couldGroupArg(arg) {
  if (
    (arg.type === 'ObjectExpression' && arg.properties.length > 0) ||
    (arg.type === 'ArrayExpression' && arg.elements.length > 0) ||
    isFunction(arg) ||
    isLinebreakingTemplateLiteral(arg) ||
    isDoFunc(arg)
  ) {
    return true
  }
  if (isIf(arg) || arg.type === 'TryStatement') {
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
      (isFunction(lastArg)
        ? !isFunction(penultimateArg)
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
      return isFunction(n.arguments[1]) && n.arguments[1].params.length <= 1
    }
  }
  return false
}

function isStringLiteral(node) {
  return node.type === 'StringLiteral'
}

function printAssignmentRight(rightNode, printedRight, options, canBreak) {
  if (hasLeadingOwnLineComment(options.originalText, rightNode, options)) {
    return indent(concat([hardline, printedRight]))
  }

  const broken = ifBreak(
    indent(concat([line, printedRight])),
    concat([line, printedRight])
  )
  const nonbroken = concat([' ', printedRight])
  if (canBreak) {
    return canBreak.ifParentBreaks
      ? ifBreak(broken, nonbroken, {visibleType: 'visible'})
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
  options,
  {shouldBreak} = {}
) {
  const node = path.getValue()
  const printedRight = path.call(print, rightName)
  const dontBreak =
    shouldInlineLogicalExpression(rightNode) ||
    rightNode.type === 'ArrayExpression' ||
    rightNode.type === 'TemplateLiteral' ||
    rightNode.type === 'TaggedTemplateExpression' ||
    isFunction(rightNode) ||
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
    (isHeregex(rightNode) &&
      rightNode.originalPattern &&
      rightNode.originalPattern.indexOf('\n') > -1) ||
    rightNode.type === 'NewExpression' ||
    (rightNode.type === 'AssignmentExpression' &&
      node.type === 'AssignmentExpression') ||
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
    shouldBreak ||
    (willBreak(printed) &&
      !(
        rightNode.type === 'CallExpression' &&
        path.call(
          rightPath => shouldGroupLastArg(rightPath, options),
          rightName
        )
      ))
  ) {
    return group(full, {shouldBreak: true, visibleType: 'assignment'})
  }
  const tryAndBreakLeftOnly = !(
    leftNode.type === 'Identifier' ||
    isStringLiteral(leftNode) ||
    leftNode.type === 'MemberExpression'
  )
  const singleGroup = group(full, {visibleType: 'assignment'})
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
    {firstBreakingIndex: 1, visibleType: 'assignment'}
  )
}

function isHeregex(node) {
  return node.type === 'RegExpLiteral' && node.delimiter === '///'
}

function isDo(node) {
  return node.type === 'UnaryExpression' && node.operator === 'do'
}

function isDoFunc(node) {
  return isDo(node) && isFunction(node.argument)
}

function printFunctionParams(path, print, options) {
  const fun = path.getValue()
  const {params} = fun

  if (!(params && params.length)) {
    if (!hasDanglingComments(fun)) {
      return ''
    }
    return concat([
      '(',
      comments.printDanglingComments(
        path,
        options,
        /* sameIndent */ true,
        comment =>
          getNextNonSpaceNonCommentCharacter(
            options.originalText,
            comment,
            options.locEnd
          ) === ')'
      ),
      ') ',
    ])
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
    const property = path.call(print, 'property')
    if (n.property.type === 'Range') {
      return property
    }
    parts.push('[', indent(concat([softline, property])), softline, ']')
    return group(concat(parts))
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
    const shouldBreakArray = !isLast && child && isFunction(child)
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
  ['??'],
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

function printComment(commentPath, options) {
  const comment = commentPath.getValue()

  switch (comment.type) {
    case 'CommentBlock': {
      if (isJsDocComment(comment)) {
        const printed = printJsDocComment(comment)
        if (
          comment.trailing &&
          !util.hasNewline(options.originalText, options.locStart(comment), {
            backwards: true,
          })
        ) {
          return concat([hardline, printed])
        }
        return printed
      }
      if (comment.value.indexOf('\n') > -1) {
        return printMultilineBlockComment(comment)
      }
      return '###' + comment.value + '###'
    }
    case 'CommentLine':
      return '#' + comment.value.trimRight()
    default:
      throw new Error('Not a comment: ' + JSON.stringify(comment))
  }
}

function isJsDocComment(comment) {
  const lines = comment.value.split('\n')
  return (
    lines.length > 1 &&
    lines
      .slice(0, lines.length - 1)
      .every((line, index) => line.trim()[0] === (index === 0 ? '*' : '#'))
  )
}

function printMultilineBlockComment(comment) {
  let indent
  const lines = comment.value.split('\n')
  lines.forEach((line, index) => {
    if (index === 0) return
    const leadingWhitespace = /^\s*/.exec(line)[0]
    if (!indent || leadingWhitespace.length < indent.length) {
      indent = leadingWhitespace
    }
  })
  const indentRegex = new RegExp(`\n${indent}`, 'g')
  const withoutIndent = comment.value.replace(indentRegex, '\n')
  const linesWithoutIndent = withoutIndent.split('\n')

  return concat(['###', join(hardline, linesWithoutIndent), '###'])
}

function printJsDocComment(comment) {
  const lines = comment.value.split('\n')

  return concat([
    '###',
    join(
      hardline,
      lines.map((line, index) =>
        index < lines.length - 1 ? line.trim() : line.trimLeft()
      )
    ),
    '###',
  ])
}

function canAttachComment(node) {
  return (
    node.type &&
    node.type !== 'CommentBlock' &&
    node.type !== 'CommentLine' &&
    node.type !== 'TemplateElement'
  )
}

function hasLeadingComment(node) {
  return node.comments && node.comments.some(comment => comment.leading)
}

function hasTrailingComment(node) {
  return node.comments && node.comments.some(comment => comment.trailing)
}

function hasDanglingComments(node, filter) {
  return (
    node.comments &&
    node.comments.some(
      comment =>
        !comment.leading &&
        !comment.trailing &&
        (filter ? filter(comment) : true)
    )
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
    endOfLine: handleComments.handleEndOfLineComment,
    remaining: handleComments.handleRemainingComment,
  },
}

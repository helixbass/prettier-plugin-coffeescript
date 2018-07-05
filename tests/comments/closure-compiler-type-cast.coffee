# test to make sure comments are attached correctly
inlineComment = ### some comment ### (
  someReallyLongFunctionCall(withLots, ofArguments))

object = {
  key: ### some comment ### (someReallyLongFunctionCall(withLots, ofArguments))
}

# preserve parens only for type casts
assignment = ###* @type {string} ### (getValue())

functionCall(1 + ###* @type {string} ### (value), ###* @type {!Foo} ### ({}))

returnValue = ->
  return ###* @type {!Array.<string>} ### (['hello', 'you'])

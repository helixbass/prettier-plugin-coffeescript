jsx = ->
  return (
    # Comment
    <div />
  )

unary = ->
  return (
    # Comment
    !!x
  )

numericLiteralNoParen = ->
  return 1337 # Comment

logical = ->
  return (
    # Reason for 42
    42
  ) && 84

binary = ->
  return (
    # Reason for 42
    42
  ) * 84

binaryInBinaryLeft = ->
  return (
    # Reason for 42
    42
  ) * 84 + 2

binaryInBinaryRight = ->
  return (
    # Reason for 42
    42
  ) + 84 * 2

conditional = ->
  return if (
    # Reason for 42
    42
  ) then 1 else 2

binaryInConditional = ->
  return if (
    # Reason for 42
    42
  ) * 3 then 1 else 2

call = ->
  return (
    # Reason for a
    a
  )()

memberInside = ->
  return (
    # Reason for a.b
    a.b
  ).c

memberOutside = ->
  return (
    # Reason for a
    a
  ).b.c

memberInAndOutWithCalls = ->
  return (
    # Reason for a
    aFunction.b()
  ).c.d()

excessiveEverything = ->
  return (
    # Reason for stuff
    if a.b() * 3 + 4 then if (a"hi"; 1) then 1 else 1 else 1
  )

# See https://github.com/prettier/prettier/issues/2392
# function sequenceExpression() {
#   return (
#     // Reason for a
#     a
#   ), b
# }

sequenceExpressionInside = ->
  return ( # Reason for a
    a; b
  )

taggedTemplate = ->
  return (
    # Reason for a
    a
  )"b"

inlineComment = ->
  return (
    ### hi ### 42
  ) || 42

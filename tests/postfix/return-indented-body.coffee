return ((fixer) ->
  fixer.removeRange rangeToRemove
) if /^\s*$/.test(
  sourceCode.text.substring rangeToRemove[0], rangeToRemove[1]
)

return ((fixer) ->
  fixer.removeRange rangeToRemove
) for a in b

return ((fixer) ->
  fixer.removeRange rangeToRemove
) while a

return (
  if a
    b
) if /^\s*$/.test(
  sourceCode.text.substring rangeToRemove[0], rangeToRemove[1]
)

return (
  if a then b
) if /^\s*$/.test(
  sourceCode.text.substring rangeToRemove[0], rangeToRemove[1]
)

return a((fixer) ->
  fixer.removeRange rangeToRemove
) if /^\s*$/.test(
  sourceCode.text.substring rangeToRemove[0], rangeToRemove[1]
)

a((fixer) ->
  fixer.removeRange rangeToRemove
) if /^\s*$/.test(
  sourceCode.text.substring rangeToRemove[0], rangeToRemove[1]
)

return a(
  if b
    c
) if /^\s*$/.test(
  sourceCode.text.substring rangeToRemove[0], rangeToRemove[1]
)


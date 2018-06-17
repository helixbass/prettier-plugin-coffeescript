f = ->
  result = if typeof fn is 'function' then await fn() else null

(->
  console.log(
    await (if true then Promise.resolve("A") else Promise.resolve("B"))
  )
)()

f = ->
  await (spellcheck && spellcheck.setChecking(false))
  await spellcheck && spellcheck.setChecking(false)

do ->

do -> a.b()

x = do (a, b = c) ->
  return something() if b
  somethingElse()

do a

f do b.c

obj.foo ? 'default'

x = (foo, bar = foo ? bar) ->

if foo then bar ? foo else baz

foo ? (bar ? baz)

foo ? baz || baz

(foo && baz) ? baz
foo and (baz ? baz)

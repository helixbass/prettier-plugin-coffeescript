[{a, b: c}, d: e, f: g, h]

f({a, b: c}, d: e, f: g, h)

({a, b: c}, h) ->

[
  {a, b: c}
  d: e, f: g
  hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
]

f(
  {a, b: c}
  d: e, f: g
  hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
)

(
  {a, b: c}
  hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
) ->

[
  {a, b: c}
  d: e
  f: g
  hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
]

f(
  {a, b: c}
  d: e
  f: g
  hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
)

# trailing implicit object
[{a, b: c}, d: e, f: g]

f({a, b: c}, d: e, f: g)

[
  {a, b: c}
  d: e, f: gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
]

f(
  {a, b: c}
  d: e, f: gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
)

# trailing explicit object
[{a, b: c}]

f({a, b: c})

({a, b: c}) ->

[
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  {a, b: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}
]

f(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  {a, b: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}
)

f(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  {a, b: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}
)

(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  {a, b: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}
) ->

# non-trailing explicit object not adjacent to implicit object
[{a, b: c}, d]

f({a, b: c}, d)

[{a, b: c}, ddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd]

f({a, b: c}, ddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd)

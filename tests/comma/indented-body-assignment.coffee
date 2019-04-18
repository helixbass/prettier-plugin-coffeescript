# TODO: this should be legal? See Coffeescript issue #5121
# [a = -> b]

a(c = -> b)

(a = d = -> b) ->

{c, a: d = -> b}

[
  d = ->
    b
]

a(
  d = ->
    b
)

(
  a = d = ->
    b
) ->

{
  c
  a: d = ->
    b
}

[d = ->]

a(d = ->)

(a = d = ->) ->

{c, a: d = ->}

[
  a
  d = ->
    b
  c
]

a(
  a
  d = ->
    b
  c
)

(
  a
  d = e = ->
    b
  c
) ->

{
  a
  d: e = ->
    b
  c
}

[
  a
  b = ->
,
  c
]

a(
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = ->
,
  c
)

(
  a = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = e = ->
,
  c
) ->

{
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d: e = ->
  c
}

[-> b]

a(-> b)

(a = -> b) ->

{c, a: -> b}

[
  ->
    b
]

a(
  ->
    b
)

(
  a = ->
    b
) ->

{
  c
  a: ->
    b
}

[->]

a(->)

(a = ->) ->

{c, a: ->}

[
  a
  ->
    b
  c
]

a(
  a
  ->
    b
  c
)

(
  a
  d = ->
    b
  c
) ->

{
  a
  d: ->
    b
  c
}

[
  a
  ->
,
  c
]

a(
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  ->
,
  c
)

(
  a = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = ->
,
  c
) ->

{
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d: ->
  c
}

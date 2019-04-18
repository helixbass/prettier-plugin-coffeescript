[class A]

a(class A)

(a = class A) ->

{c, a: class A}

[
  class A
    b: ->
]

a(
  class A
    b: ->
)

(
  a = class A
    b: ->
) ->

{
  c
  a: class A
    b: ->
}

[
  a
  class A
    b: ->
  d
]

a(
  a
  class A
    b: 2
  d
)

(
  a
  d = class A
    b: ->
      1
  e
) ->

{
  a
  d: class A
    b: ->
  c
}

[
  a
  class A
,
  d
]

a(
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  class A
,
  c
)

(
  a = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = class A
,
  c
) ->

{
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d: class A
  c
}

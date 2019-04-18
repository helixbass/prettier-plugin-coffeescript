[while b then c]

a(until b then c)

(a = while b then c) ->

{c, a: while b then c}

[
  while b
    c
]

a(
  while b
    c
)

(
  a = while b
    c
) ->

{
  c
  a: while b
    c
}

[
  a
  while b
    c
  d
]

a(
  a
  while b
    c
  d
)

(
  a
  d = while b
    c
  e
) ->

{
  a
  d: while b
    e
  c
}

[
  a
  while b then c
,
  d
]

a(
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  while d then e
,
  c
)

(
  a = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = while e then f
,
  c
) ->

{
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d: while e then f
  c
}

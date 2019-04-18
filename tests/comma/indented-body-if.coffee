[if b then c]

a(if b then c)

(a = if b then c) ->

{c, a: if b then c}

[
  if b
    c
]

a(
  if b
    c
)

(
  a = if b
    c
) ->

{
  c
  a: if b
    c
}

[
  a
  if b
    c
  d
]

a(
  a
  if b
    c
  d
)

(
  a
  d = if b
    c
  e
) ->

{
  a
  d: if b
    e
  c
}

[
  a
  if b then c
,
  d
]

a(
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  if d then e
,
  c
)

(
  a = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = if e then f
,
  c
) ->

{
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d: if e then f
  c
}

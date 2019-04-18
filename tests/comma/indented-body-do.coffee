[do -> b]

a(do -> b)

(a = do -> b) ->

{c, a: do -> b}

[
  do ->
    b
]

a(
  do ->
    b
)

(
  a = do ->
    b
) ->

{
  c
  a: do ->
    b
}

[do ->]

a(do ->)

(a = do ->) ->

{c, a: do ->}

[
  a
  do ->
    b
  c
]

a(
  a
  do ->
    b
  c
)

(
  a
  d = do ->
    b
  c
) ->

{
  a
  d: do ->
    b
  c
}

[
  a
  do ->
,
  c
]

a(
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  do ->
,
  c
)

(
  a = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d = do ->
,
  c
) ->

{
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  d: do ->
  c
}

[
  switch b
    when c
      d
]

a(
  switch b
    when c then d
)

(
  a = switch b
    when c
      d
) ->

{
  c
  a: switch b
    when c then d
}

[
  a
  switch b
    when c then d
  e
]

a(
  a
  switch b
    when c
      d
  e
)

(
  a
  d = switch b
    when c
      e
  f
) ->

{
  a
  d: switch b
    when e then f
  c
}

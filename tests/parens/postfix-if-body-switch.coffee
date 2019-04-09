(
  switch a
    when b
      c
) if d

a(
  switch b
    when c then d
) if e

(x = switch a
  when b
    c
) if d

(x = a(
  switch b
    when c then d
)) if e

(a do switch b
  when c
    d
) if e

(do a =
  switch b
    when c
      d
) if e

(a do b =
  switch c
    when d
      e
) if f

(a g, do b =
  switch c
    when d
      e
) if f

(a b,
  switch c
    when d then e
) if f

(a b,
  x = switch c
    when d then e
) if f

(a b, do switch c
  when d
    e
) if f

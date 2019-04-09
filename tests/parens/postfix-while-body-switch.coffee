(
  switch a
    when b
      c
) while d

a(
  switch b
    when c then d
) while e

(x = switch a
  when b
    c
) while d

(x = a(
  switch b
    when c then d
)) until e

(a do switch b
  when c
    d
) while e

(do a =
  switch b
    when c
      d
) while e

(a do b =
  switch c
    when d
      e
) while f

(a g, do b =
  switch c
    when d
      e
) while f

(a b,
  switch c
    when d then e
) while f

(a b,
  x = switch c
    when d then e
) while f

(a b, do switch c
  when d
    e
) while f

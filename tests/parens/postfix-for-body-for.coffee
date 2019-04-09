(
  for a in b
    c
) for d in e

(for a in b then c) for d in e

(a(for b in c then d)) for d in e

a(
  for b in c
    d
) for d in e

(x = for a in b then c) for d in e

(x = for a in b
  c
) for d in e

(x = a(for b in c then d)) for e in f

(x = a(
  for b in c
    d
)) for e in f

(a b, (for c in d then e)) for f in g

(a b,
  for c in d
    e
) for f in g

(a b, x = (for c in d then e)) for f in g

(a b,
  x = for c in d
    e
) for f in g

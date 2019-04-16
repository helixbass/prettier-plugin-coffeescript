# implicit calls
[aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbb(ccccccccccccccccc), ddddddddd(eeeeeeeeeeeeee)]

f(aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbb(ccccccccccccccccc), ddddddddd(eeeeeeeeeeeee))

{a, aaaaaaaaaaaaaaaaaaaa: bbbbbbbbbbbbbbbb(ccccccccccccccccc), d: ddddddddd(eeeeeeee)}

aaaaaaaaaaaaaaaaaaaa: bbbbbbbbbbbbbbbb(ccccccccccccccccc), d: ddddddddd(eeeeeeeeeeeee)

(aaaaaaaaaaaaaaaaaaaa = bbbbbbbbbbbbbbbb(ccccccccccccccccc), d = ddddddd(eeeeeeee)) ->

# Object that omits braces if parent breaks
[a, {b: c(d), e: f(g)}, h]

[
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  bbbbbbb: ccccccccc dddddddddddd
  eeeeeee: fffffffff gggggggggggg
  h
]

[a, {b: c(d), e: f(g)}]

[
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  bbbbbbb: ccccccccc dddddddddddd
  eeeeeee: fffffffff gggggggggggg
]

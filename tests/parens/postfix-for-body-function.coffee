(x ->
  a
) for b in c

(y ->) for b in c

a b for b in c

(a b ->) for b in c

(->) for b in c

(->
  a
) for b in c

(a = ->) for b in c

(a = ->
  c
) for b in c

(a = b ->) for b in c

(a = b ->
  c
) for b in c

(a do ->
  b
) for b in c

(x = do ->
  y
) for b in c

(do x = ->
  y
) for b in c

(a do b = ->
  c
) for b in c

(a b, do ->
  c
) for b in c

(a e, do b = ->
  c
) for b in c

(a e, ->
  c
) for b in c

(a e, -> c) for b in c

(a b = ->
  c
) for b in c

(a e, b = ->
  c
) for b in c

(test 'a', ->
  b
) for b in c

(x ->
  a
) if b

(y ->) if b

a b if c

(a b ->) if c

(->) if b

(->
  a
) if b

(a = ->) if b

(a = ->
  c
) if b

(a = b ->) if c

(a = b ->
  c
) if d

(a do ->
  b
) if c

(x = do ->
  y
) if z

(do x = ->
  y
) if z

(a do b = ->
  c
) if d

(a b, do ->
  c
) if d

(a e, do b = ->
  c
) if d

(a e, ->
  c
) if d

(a e, -> c) if d

(a b = ->
  c
) if d

(a e, b = ->
  c
) if d

(test 'a', ->
  b
) if c

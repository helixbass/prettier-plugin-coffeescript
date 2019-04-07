(x ->
  a
) if b

(y ->) if b

a b if c

(a b ->) if c

(->) if b

(a = ->) if b

(a = ->
  c
) if b

(a = b ->) if c

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

(a e, do b = ->
  c
) if d

(a e, ->
  c
) if d

(a e, -> c) if d

(a e, b = ->
  c
) if d

(
  if a
    b
  else
    c
) if d

(if a then b else c) if d

(x = if a then b else c) if d

(e if a then b else c) if d

(do ->
  a
) if b

(try a) if b

(
  try
    a
  catch
    d
) if b

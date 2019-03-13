f = ->
  if position
    return name: pair
  else
    return {name: pair.substring(0, position), value: pair.substring(position + 1)}

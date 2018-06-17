foo = ->
  return this.hasPlugin("dynamicImports") && this.lookahead().type is tt.parenLeft.right

foo = ->
  return if @hasPlugin("dynamicImports") and @lookahead().type is tt.parenLeft.right.left.right then yes else no

foo = ->
  return if this.calculate().compute().first.numberOfThings > this.calculate().compute().last.numberOfThings then true else false

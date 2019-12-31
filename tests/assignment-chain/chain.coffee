aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccc

aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccc

aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb[cccccccccccccccccc]

aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb[cccccccccccccccccc]

aaaaaaaaa = bbbbbbbb().ccccccccc(-> d).eeeeeeeeeeeeeeeeeeeeeeee.fffffffffffffffffffffffff

aaaaaaaaa: bbbbbbbb().ccccccccc(-> d).eeeeeeeeeeeeeeeeeeeeeeee.fffffffffffffffffffffffff

aaaaaaaaa = bbbbbbbb().ccccccccc(-> d).eeeeeeeeeeeeeeeeeeeeeeee.fffffffffffffffffffffffff()

aaaaaaaaa: bbbbbbbb().ccccccccc(-> d).eeeeeeeeeeeeeeeeeeeeeeee.fffffffffffffffffffffffff()

aaaaaaaaa = bbbbbbbb.ccccccccc(-> d).eeeeeeeeeeeeeeeeeeeeeeee.fffffffffffffffffffffffff()

aaaaaaaaa: bbbbbbbb.ccccccccc(-> d).eeeeeeeeeeeeeeeeeeeeeeee.fffffffffffffffffffffffff()

a = b.c (d) ->
  e

ruleTester.run "#{ruleName}:strict", rule,
  valid: [...alwaysValid].map(ruleOptionsMapperFactory strictOptions).map(parserOptionsMapper)
  invalid: [...neverValid].map(ruleOptionsMapperFactory strictOptions).map parserOptionsMapper

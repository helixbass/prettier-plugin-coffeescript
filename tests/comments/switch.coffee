switch node && node.type
  when "Property", "MethodDefinition"
    prop = node.key

  when "MemberExpression"
    prop = node.property

  # no default

switch foo
  when "bar"
    doThing()

  # no default

switch foo
  when "bar" #comment
    doThing() #comment

  when "baz"
    doOtherThing() #comment

switch foo
  when "bar"
    doThing()
  #comment

  when "baz"
    doThing()
  #comment

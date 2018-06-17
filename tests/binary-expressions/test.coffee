# It should always break the highest precedence operators first, and
# break them all at the same time.

x = longVariable + longVariable + longVariable
x = longVariable + longVariable + longVariable + longVariable - longVariable + longVariable
x = longVariable + longVariable * longVariable + longVariable - longVariable + longVariable
x = longVariable + longVariable * longVariable * longVariable / longVariable + longVariable

x = longVariable && longVariable && longVariable && longVariable && longVariable && longVariable
x = longVariable && longVariable || longVariable && longVariable || longVariable && longVariable
x = firstItemWithAVeryLongNameThatKeepsGoing || firstItemWithAVeryLongNameThatKeepsGoing || {}
x = firstItemWithAVeryLongNameThatKeepsGoing || firstItemWithAVeryLongNameThatKeepsGoing || []
x = call(firstItemWithAVeryLongNameThatKeepsGoing, firstItemWithAVeryLongNameThatKeepsGoing) || []

x = longVariable * longint && longVariable >> 0 && longVariable + longVariable

x = longVariable > longint && longVariable is 0 + longVariable * longVariable

foo(if obj.property * new Class() && obj instanceof Class && longVariable then number + 5 else false)

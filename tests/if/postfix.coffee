a if b
a unless b

->
  return a if b
->
  doSomething()
  return a unless b

f() if b

->
  return unless some(veryVeryVeryVeryVeryLong, condition, isActuallyFalsyCausingThisToReturn)

  return some(veryVeryVeryVeryVeryLong, returnValue, thatIsLongEnoughToBreakLineItself) unless someCondition

  otherwise()

compose(
  sortBy((x) => x),
  flatten,
  map((x) => [x, x*2])
)

somelib.compose(
  sortBy((x) -> x),
  flatten,
  map((x) -> [x, x*2])
)

composeFlipped(
  sortBy((x) => x),
  flatten,
  map((x) => [x, x*2])
)

somelib.composeFlipped(
  sortBy((x) => x),
  flatten,
  map((x) => [x, x*2])
)

hasValue = hasOwnProperty(a, b)

this.compose(sortBy((x) => x), flatten)
@a.b.c.compose(sortBy((x) => x), flatten)
someObj.someMethod(@field.compose(a, b))

class A extends B
  compose: ->
    super.compose(sortBy((x) => x), flatten)

@subscriptions.add(
            @componentUpdates
                .pipe(startWith(@props), distinctUntilChanged(isEqual))
                .subscribe (props) ->
        )

h(f(g(() =>
  a
)))

deepCopyAndAsyncMapLeavesA(
  {
    source: sourceValue
    destination: destination[sourceKey]
  },
  { valueMapper, overwriteExistingKeys }
)

deepCopyAndAsyncMapLeavesB(
  1337,
  { source: sourceValue, destination: destination[sourceKey] },
  {
    valueMapper
    overwriteExistingKeys
  }
)

deepCopyAndAsyncMapLeavesC(
  { source: sourceValue, destination: destination[sourceKey] },
  1337,
  { valueMapper, overwriteExistingKeys }
)

someFunction = (url) ->
  get(url)
    .then(
      (json) => dispatch(success(json)),
      (error) => dispatch(failed(error))
    )

mapChargeItems = fp.flow(
  (l) => if l < 10 then l else 1,
  (l) => Immutable.Range(l).toMap()
)

expect(new LongLongLongLongLongRange([0, 0], [0, 0])).toEqualAtomLongLongLongLongRange(new LongLongLongRange([0, 0], [0, 0]))

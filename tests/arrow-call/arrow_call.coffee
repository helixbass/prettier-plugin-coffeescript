testResults = results.testResults.map((testResult) =>
  formatResult(testResult, formatter, reporter)
)

it('mocks regexp instances', () =>
  expect(
    () => moduleMocker.generateFromMetadata(moduleMocker.getMetadata(/a/)),
  ).not.toThrow()
)

expect(() => asyncRequest({ url: "/test-endpoint123" }))
  .toThrowError(/Required parameter/)

expect(() => asyncRequest({ url: "/test-endpoint123-but-with-a-long-url" }))
  .toThrowError(/Required parameter/)

expect(() => asyncRequest({ url: "/test-endpoint-but-with-a-suuuuuuuuper-long-url" }))
  .toThrowError(/Required parameter/)

expect(() => asyncRequest({ type: "foo", url: "/test-endpoint123456" }))
  .not.toThrowError()

expect(() => asyncRequest({ type: "foo", url: "/test-endpoint-but-with-a-long-url" }))
  .not.toThrowError()

a = Observable
  .fromPromise(axiosInstance.post('/carts/mine'))
  .map((response) => response.data)

b = Observable.fromPromise(axiosInstance.get(url))
  .map((response) => response.data)

func(
  veryLoooooooooooooooooooooooongName,
  (veryLooooooooooooooooooooooooongName) =>
    veryLoooooooooooooooongName.something()
)

composition = (ViewComponent, ContainerComponent) =>
  class extends React.Component
    @propTypes = {}

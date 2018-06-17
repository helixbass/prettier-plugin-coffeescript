fn = (b) => (c) => (d) =>
  return 3

foo = (a, b) => (c) => (d) =>
  return 3

bar = (a) => (b) => (c) => a + b + c

mw = (store) => (next) => (action) =>
  return next(action)

middleware = (options) => (req, res, next) =>
  # ...

import { flowRight } from "lodash"

foo = flowRight(
  (x) => x + 1,
  (x) => x * 3,
  (x) => x - 6,
)

foo(6)

import * as _ from "lodash"

foo = _.flowRight(
  (x) => x + 1,
  (x) => x * 3,
  (x) => x - 6,
)

foo(6)

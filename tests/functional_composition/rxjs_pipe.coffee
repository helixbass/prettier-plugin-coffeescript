import { range } from 'rxjs/observable/range'
import { map, filter, scan } from 'rxjs/operators'

source$ = range(0, 10)

source$.pipe(
  filter((x) => x % 2 is 0),
  map((x) => x + x),
  scan(
    (acc, x) => acc + x,
    0
  )
)
.subscribe((x) => console.log(x))

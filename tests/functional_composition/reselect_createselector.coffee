import { createSelector } from 'reselect'

resolve = createSelector(
  getIds,
  getObjects,
  (ids, objects) => ids.map((id) => objects[id])
)

resolve = createSelector(
  [getIds, getObjects],
  (ids, objects) => ids.map((id) => objects[id])
)

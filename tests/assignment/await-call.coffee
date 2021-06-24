f = ->
  history = await SearchHistory.find({
    where: q
    limit: 10000
    skip: 0
    sort: 'createdAt ASC'
  })

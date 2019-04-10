f = R.pipe(Math.pow, R.negate, R.inc)

f(3, 4) # -(3^4) + 1

#  parseJson :: String -> Maybe *
#  get :: String -> Object -> Maybe *

#  getStateCode :: Maybe String -> Maybe String
getStateCode = R.pipeK(
  parseJson,
  get("user"),
  get("address"),
  get("state"),
  R.compose(Maybe.of, R.toUpper)
)

getStateCode('{"user":{"address":{"state":"ny"}}}')
#=> Just('NY')
getStateCode("[Invalid JSON]")
#=> Nothing()

#  followersForUser :: String -> Promise [User]
followersForUser = R.pipeP(db.getUserById, db.getFollowers)

classyGreeting = (firstName, lastName) =>
  "The name's " + lastName + ", " + firstName + " " + lastName
yellGreeting = R.compose(R.toUpper, classyGreeting)
yellGreeting("James", "Bond") #=> "THE NAME'S BOND, JAMES BOND"

R.compose(Math.abs, R.add(1), R.multiply(2))(-4) #=> 7

#  get :: String -> Object -> Maybe *
get = R.curry((propName, obj) => Maybe(obj[propName]))

#  getStateCode :: Maybe String -> Maybe String
getStateCode = R.composeK(
  R.compose(Maybe.of, R.toUpper),
  get("state"),
  get("address"),
  get("user")
)
getStateCode({ user: { address: { state: "ny" } } }) #=> Maybe.Just("NY")
getStateCode({}) #=> Maybe.Nothing()

db = {
  users: {
    JOE: {
      name: "Joe",
      followers: ["STEVE", "SUZY"]
    }
  }
}

# We'll pretend to do a db lookup which returns a promise
lookupUser = (userId) => Promise.resolve(db.users[userId])
lookupFollowers = (user) => Promise.resolve(user.followers)
lookupUser("JOE").then(lookupFollowers)

#  followersForUser :: String -> Promise [UserId]
followersForUser = R.composeP(lookupFollowers, lookupUser)
followersForUser("JOE").then((followers) => console.log("Followers:", followers))
# Followers: ["STEVE","SUZY"]

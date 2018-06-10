Seq(typeDef.interface.groups).forEach((group) =>
  Seq(group.members).forEach((member, memberName) =>
    markdownDoc(
      member.doc,
      {
        typePath: typePath.concat(memberName.slice(1)),
        signatures: member.signatures
      }
    )
  )
)

promiseFromCallback = (fn) =>
  new Promise((resolve, reject) =>
    fn((err, result) =>
      if (err) then return reject(err)
      return resolve(result)
    )
  )

runtimeAgent.getProperties(
  objectId,
  false, # ownProperties
  false, # accessorPropertiesOnly
  false, # generatePreview
  (error, properties, internalProperties) =>
    return 1
)

render = ->
  return (
    <View>
      <Image
        onProgress={(e) => this.setState({progress: Math.round(100 * e.nativeEvent.loaded / e.nativeEvent.total)})}
      />
    </View>
  )

render = ->
  (
    <View>
      <Image
        onProgress={(e) =>
          this.setState({
            progress: Math.round(
              100 * e.nativeEvent.loaded / e.nativeEvent.total,
            ),
          })}
      />
    </View>
  )

render = ->
  return (
    <View>
      <Image
        onProgress={(e) =>
          this.setState({
            progress: Math.round(
              100 * e.nativeEvent.loaded / e.nativeEvent.total,
            ),
          })}
      />
    </View>
  )

jest.mock(
  '../SearchSource',
  () => class
    findMatchingTests: (pattern) ->
      return {paths: []}
)

foooooooooooooooooooooooooooooooooooooo((action) => (next) =>
    dispatch(action)
)

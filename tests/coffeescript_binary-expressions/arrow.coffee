f = ->
  appEntitys = getAppEntitys(loadObject).filter(
    (entity) -> entity && entity.isInstallAvailable() && !entity.isQueue() && entity.isDisabled()
  )

f = ->
  appEntitys = getAppEntitys(loadObject).map(
    entity -> entity && entity.isInstallAvailable() && !entity.isQueue() && entity.isDisabled() && {
      id: entity.id
    }
  )

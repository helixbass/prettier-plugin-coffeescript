<div>
  {if __DEV__
    @renderDevApp()
  else
    <div>
      {routes.map (route) ->
        <MatchAsync
          key={"#{route.to}-async"}
          pattern={route.to}
          exactly={route.to is '/'}
          getComponent={routeES6Modules[route.value]}
        />
      }
    </div>
  }
</div>

<div>
  {__DEV__ &&
    <div>
      {routes.map (route) ->
        <MatchAsync
          key={"#{route.to}-async"}
          pattern={route.to}
          exactly={route.to is '/'}
          getComponent={routeES6Modules[route.value]}
        />
      }
    </div>
  }
</div>

<div>
  {member.memberName.memberSomething +
    if member.memberDef.memberSomething.signatures then '()' else ''
  }
</div>

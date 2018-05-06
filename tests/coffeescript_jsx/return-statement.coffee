NonBreakingFunction = -> <div />

BreakingFunction = -> <div>
  <div>
    bla bla bla
  </div>
</div>

NonBreakingFunctionWExplicitReturn = -> return <div />
BreakingFunctionWExplicitReturn = ->
  return <div>
    <div>
      bla bla bla
    </div>
  </div>

class NonBreakingClass extends React.component
  render: ->
    <div />

class BreakingClass extends React.component
  render: ->
    <div>
      <div>
        bla bla bla
      </div>
    </div>

class NonBreakingClassWExplicitReturn extends React.component
  render: ->
    return <div />

class BreakingClass extends React.component
  render: ->
    return <div>
      <div>
        bla bla bla
      </div>
    </div>

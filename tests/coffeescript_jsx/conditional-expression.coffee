if <div /> then jsxModeFromElementNonBreaking else 'a'

if jsxModeFromElementNonBreaking then <div /> else 'a'

if jsxModeFromElementNonBreaking then 'a' else <div />

if <div><span>thisIsASongAboutYourPoorSickPenguinHeHasAFeverAndHisToesAreBlueButIfISingToYourPoorSickPenguinHeWillFeelBetterInADayOrTwo</span></div>
  'jsx mode from element breaking'
else
  'a'

if 'jsx mode from element breaking'
  <div><span>thisIsASongAboutYourPoorSickPenguinHeHasAFeverAndHisToesAreBlueButIfISingToYourPoorSickPenguinHeWillFeelBetterInADayOrTwo</span></div>
else
  'a'

if 'jsx mode from element breaking'
  'a'
else
  <div><span>thisIsASongAboutYourPoorSickPenguinHeHasAFeverAndHisToesAreBlueButIfISingToYourPoorSickPenguinHeWillFeelBetterInADayOrTwo</span></div>

<div>
  {if a then 'a' else if b then 'b' else 'c'}
</div>

if cable then 'satellite' else if publiq then 'affairs' else if network then <span id="c" /> else 'dunno'

if cable then 'satellite' else if publiq then 'affairs' else if network then <div><span>thisIsASongAboutYourPoorSickPenguinHeHasAFeverAndHisToesAreBlueButIfISingToYourPoorSickPenguinHeWillFeelBetterInADayOrTwo</span></div> else 'dunno'

if cable then <div><span>thisIsASongAboutYourPoorSickPenguinHeHasAFeverAndHisToesAreBlueButIfISingToYourPoorSickPenguinHeWillFeelBetterInADayOrTwo</span></div> else if sateline then 'public' else if affairs then 'network' else 'dunno'

<div>
  {properties.length > 1 or (
    if properties.length is 1 and properties[0].apps.size > 1
      if not draggingApp? and not newPropertyName?
        <MigrationPropertyListItem />
      else
        <MigrationPropertyListItem apps={Immutable.List()}/>
    else null
  )}
</div>

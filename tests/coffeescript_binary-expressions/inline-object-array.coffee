prevState = prevState || {
  catalogs: [],
  loadState: LOADED,
  opened: false,
  searchQuery: '',
  selectedCatalog: null,
}

prevState = prevState or
  defaultState or
    catalogs: []
    loadState: LOADED
    opened: no
    searchQuery: ''
    selectedCatalog: null

prevState = prevState ||
  defaultState && {
    catalogs: [],
    loadState: LOADED,
    opened: false,
    searchQuery: '',
    selectedCatalog: null,
  }

prevState = prevState || useDefault && defaultState || {
    catalogs: [],
    loadState: LOADED,
    opened: false,
    searchQuery: '',
    selectedCatalog: null,
  }

this.steps = steps || [
  {
    name: 'mock-module',
    path: '/nux/mock-module',
  },
]

@steps = steps || checkStep && [
  name: 'mock-module'
  path: '/nux/mock-module'
]

this.steps = steps && checkStep || [
  {
    name: 'mock-module',
    path: '/nux/mock-module',
  },
]

create = ->
  result = doSomething()
  shouldReturn &&
  result.ok && {
    status: "ok",
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
  }

create = ->
  result = doSomething()
  shouldReturn && result.ok && result || {
    status: "ok",
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
  }

obj = {
  state: shouldHaveState &&
    stateIsOK && {
      loadState: LOADED,
      opened: no
    },
  loadNext: stateIsOK && hasNext || {
      skipNext: yes
    },
  loaded: yes
}

run_spec(__dirname, ['coffeescript'], {noImplicit: []})
run_spec(__dirname, ['coffeescript'], {noImplicit: ['objectBraces']})
run_spec(__dirname, ['coffeescript'], {noImplicit: ['callParens']})
run_spec(__dirname, ['coffeescript'], {
  noImplicit: ['objectBraces', 'callParens'],
})

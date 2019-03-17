run_spec(__dirname, ['coffeescript'], {respectExplicit: []})
run_spec(__dirname, ['coffeescript'], {respectExplicit: ['callParens']})
run_spec(__dirname, ['coffeescript'], {respectExplicit: ['objectBraces']})
run_spec(__dirname, ['coffeescript'], {
  respectExplicit: ['callParens', 'objectBraces'],
})

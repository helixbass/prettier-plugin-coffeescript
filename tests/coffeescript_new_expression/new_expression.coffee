new (memoize.Cache || MapCache)
new (if typeof this == 'function' then this else Dict())
new (createObj()).prop(a())

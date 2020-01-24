export default class MyClass extends MyOtherClass
  DEFAULTS: {
    (@::DEFAULTS)...
    a: 1
    b: 1
  }

{(opts?.data?.root)..., (opts?.data)...}

{
  ...(a::b),
  ...(a.b::c),
  ...(a.b?.c),
  ...(a().b?.c),
  (a?())...,
}

f(a?.b...)
f(a::b...)
f(a?()...)

[a?.b...]
[a::b...]
[a?()...]

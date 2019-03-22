@tokens.splice (if @tag(i - 1) is ',' then i - 1 else i), 0, outdent
@tokens.splice 0, outdent, (if @tag(i - 1) is ',' then i - 1 else i)
@tokens.splice (if @tag(i - 1) is ',' then i - 1 else i), 0, outdent, moreLongArgs

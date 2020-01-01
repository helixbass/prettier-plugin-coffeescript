@token 'TERMINATOR', '\n', offset: offset + outdentLength, length: 10000 unless tag() is 'TERMINATOR' or noNewlines

@token 'TERMINATOR', '\n', offset: offset + outdentLength, length: 1 unless tag() is 'TERMINATOR' or noNewlines

@token 'TERMINATOR', '\n', offset: offset + outdentLength, length: 10000 while b

@token 'TERMINATOR', '\n', offset: offset + outdentLength, length: 10000 for b in c

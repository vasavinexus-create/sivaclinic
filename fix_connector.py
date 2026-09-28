# -*- coding: utf-8 -*-
import codecs

path = 'lib/powersync/Connector.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace("op.op === 'put'", "op.op === 'PUT'")
code = code.replace("op.op === 'patch'", "op.op === 'PATCH'")
code = code.replace("op.op === 'delete'", "op.op === 'DELETE'")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Fixed Connector.ts")

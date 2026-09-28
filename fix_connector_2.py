# -*- coding: utf-8 -*-
import codecs

path = 'lib/powersync/Connector.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace("await table.upsert(op.opData);", "await table.upsert(op.opData!);")
code = code.replace("await table.update(op.opData).eq('id', op.id);", "await table.update(op.opData!).eq('id', op.id);")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Fixed Connector.ts opData")

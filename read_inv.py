# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/lib/modules.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

idx = code.find('key: "inventory"')
if idx == -1: idx = code.find('inventory')
print(code[max(0,idx-50):idx+800])

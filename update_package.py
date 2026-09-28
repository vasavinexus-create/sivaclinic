# -*- coding: utf-8 -*-
import codecs

path = 'package.json'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace("NODE_OPTIONS=--max-old-space-size=4096", "NODE_OPTIONS='--max-old-space-size=4096 --dns-result-order=ipv4first'")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated package.json")

# -*- coding: utf-8 -*-
import codecs

path = 'package.json'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace("cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS='--max-old-space-size=4096 --dns-result-order=ipv4first --tls-min-v1.0'", "cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS=--max-old-space-size=4096")
code = code.replace("cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS='--max-old-space-size=4096 --dns-result-order=ipv4first'", "cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS=--max-old-space-size=4096")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Fixed package.json syntax")

# -*- coding: utf-8 -*-
import codecs

path = 'app/api/v2/consultations/route.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace("user = authData?.user;", "user = authData?.user || undefined;")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Fixed type error")

# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

search = 'if (field.type === "number") return raw !== null && String(raw) !== "" ? Number(raw) : null;'
replace = 'if (field.type === "number") return raw !== null && String(raw) !== "" ? Number(raw) : 0;'

if search in code:
    code = code.replace(search, replace)
    with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
        f.write(code)
    print('Fixed formValue for numbers')
else:
    print('Search string not found')

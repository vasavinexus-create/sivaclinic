# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Replace <div className="page-head">
code = code.replace(
    '<div className="page-head">',
    '<div className={`page-head ${isPrintingCustom ? "print-hide" : ""}`}>'
)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed page-head")

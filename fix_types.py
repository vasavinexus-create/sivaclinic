# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'const debit = lines.reduce((s, r) => s + r.debit, 0);',
    'const debit = lines.reduce((s: number, r: Row) => s + r.debit, 0);'
)
code = code.replace(
    'const credit = lines.reduce((s, r) => s + r.credit, 0);',
    'const credit = lines.reduce((s: number, r: Row) => s + r.credit, 0);'
)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)
print("Fixed types")

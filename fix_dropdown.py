# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    '{view === "Ledger Statement" && <label',
    '{(view === "Ledger Statement" || view === "Ledger Report") && <label'
)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)

print('Fixed ledger dropdown')

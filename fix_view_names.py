# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'if (view === "Cash Book" || view === "Cash Ledger") {',
    'if (view === "Cash Book" || view === "Daily Cash Book" || view === "Cash Ledger") {'
)
code = code.replace(
    '} else if (view === "Reports" || view === "Sales Report") {',
    '} else if (view === "Reports" || view === "Sales Report" || view === "Sales/Billing Report") {'
)
code = code.replace(
    '} else if (view === "GST Report") {',
    '} else if (view === "GST Report" || view === "GST/Tax Report") {'
)
code = code.replace(
    'rows = cash.rows;\n    columns = [["date", "Date"],',
    'rows = cash.rows;\n    columns = [["date", "Date"],'
) # Wait, is rows = cash.rows missing?

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)
print('Fixed view names')

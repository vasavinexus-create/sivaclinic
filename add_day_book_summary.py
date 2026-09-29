# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'if (view === "Cash Book" || view === "Daily Cash Book" || view === "Cash Ledger") {',
    'if (view === "Day Book") {\n    summaries = [["Total Debits", rows.reduce((s: number, r: Row) => s + Number(r.debit), 0)], ["Total Credits", rows.reduce((s: number, r: Row) => s + Number(r.credit), 0)]];\n  } else if (view === "Cash Book" || view === "Daily Cash Book" || view === "Cash Ledger") {'
)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)

print('Added Day Book summary')

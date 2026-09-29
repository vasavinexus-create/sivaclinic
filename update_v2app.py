# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/V2App.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'const accountReportPages = new Set([\n    "day-book", "cash-ledger", "sales-account", "ledger-statement",\n    "current-balance", "balance-sheet", "profit-loss", "reports"\n  ]);',
    'const accountReportPages = new Set([\n    "day-book", "cash-book", "bank-book", "sales-report", "purchase-report", "expense-report", "ledger-report", "trial-balance",\n    "current-balance", "balance-sheet", "profit-loss", "receivables-report", "payables-report", "gst-report", "outstanding-report", "reports", "cash-ledger", "sales-account", "ledger-statement"\n  ]);'
)

with codecs.open('app/v2/V2App.tsx', 'w', 'utf-8') as f:
    f.write(code)
print('Updated V2App accountReportPages')

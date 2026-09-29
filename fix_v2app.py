# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/V2App.tsx', 'r', 'utf-8') as f:
    code = f.read()

pattern = r'const accountReportPages = new Set\(\[.*?\]\);'
replacement = 'const accountReportPages = new Set([\n  "day-book", "cash-book", "bank-book", "sales-report", "purchase-report", "expense-report", "ledger-report", "trial-balance",\n  "current-balance", "balance-sheet", "profit-loss", "receivables-report", "payables-report", "gst-report", "outstanding-report", "reports", "cash-ledger", "sales-account", "ledger-statement"\n]);'

code = re.sub(pattern, replacement, code, flags=re.DOTALL)

with codecs.open('app/v2/V2App.tsx', 'w', 'utf-8') as f:
    f.write(code)

print('Fixed accountReportPages')

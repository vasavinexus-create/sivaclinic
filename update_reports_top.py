# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Replace reportViews
code = code.replace(
    'const reportViews = ["Day Book", "Cash Ledger", "Sales Account", "Ledger Statement", "Current Balance", "Balance Sheet", "Profit & Loss", "Reports"];',
    'const reportViews = ["Day Book", "Cash Book", "Bank Book", "Sales Report", "Purchase Report", "Expense Report", "Ledger Report", "Trial Balance", "Current Balance", "Balance Sheet", "Profit & Loss", "Receivables Report", "Payables Report", "GST Report", "Outstanding Report"];'
)

# Fix queries
code = code.replace(
    '.eq("mode", "cash").lte("paid_at", end)',
    '.lte("paid_at", end)'
)
code = code.replace(
    '.eq("payment_mode", "cash").lte("occurred_at", end)',
    '.lte("occurred_at", end)'
)

# Add purchases to query and setData
code = code.replace(
    'readAll(() => query("supplier_ledger", "id,debit,credit").lte("occurred_on", to).order("id")),',
    'readAll(() => query("supplier_ledger", "id,debit,credit").lte("occurred_on", to).order("id")),\n        readAll(() => query("purchases", "id,purchase_no,invoice_date,grand_total,status,supplier:suppliers(name)").neq("status", "cancelled").gte("invoice_date", f"{from}").lte("invoice_date", end).order("invoice_date").order("id")),'
)
code = code.replace(
    ']).then(([journals, ledgers, sales, payments, cash, batches, supplier]) => {',
    ']).then(([journals, ledgers, sales, payments, cash, batches, supplier, purchases]) => {'
)
code = code.replace(
    'if (alive) setData({ journals, ledgers, sales, payments, cash, batches, supplier });',
    'if (alive) setData({ journals, ledgers, sales, payments, cash, batches, supplier, purchases });'
)

# Add purchases to setData type
code = code.replace(
    'cash: [], batches: [], supplier: [] });',
    'cash: [], batches: [], supplier: [], purchases: [] });'
)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)
print('Done updating top half of FinancialReports.')

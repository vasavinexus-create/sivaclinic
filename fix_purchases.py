# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Fix the query
code = code.replace(
    'query("purchases", "id,purchase_no,invoice_date,grand_total,status,supplier:suppliers(name)")',
    'query("purchases", "id,purchase_no,invoice_date,invoice_total,status,supplier:suppliers(name)")'
)

# Fix the render map
code = code.replace(
    '["grand_total", "Total"], ["status", "Status"]];',
    '["invoice_total", "Total"], ["status", "Status"]];'
)
code = code.replace(
    'summaries = [["Total Purchases", rows.reduce((sum, r) => sum + Number(r.grand_total), 0)]];',
    'summaries = [["Total Purchases", rows.reduce((sum, r) => sum + Number(r.invoice_total), 0)]];'
)
code = code.replace(
    'const moneyKeys = new Set(["debit", "credit", "receipt", "payment", "balance", "amount", "pharmacy_revenue", "doctor_fee", "grand_total"]);',
    'const moneyKeys = new Set(["debit", "credit", "receipt", "payment", "balance", "amount", "pharmacy_revenue", "doctor_fee", "grand_total", "invoice_total"]);'
)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)

print('Fixed purchases column name.')

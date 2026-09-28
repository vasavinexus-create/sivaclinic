# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_balance_line = '<span>Prev. ledger balance: <b style={{ color: balance > 0 ? "#c53030" : "#276749" }}>{money(balance)}</b></span>'
new_balance_line = '<span>Prev. ledger balance: <b style={{ color: balance + pendingFee > 0 ? "#c53030" : "#276749" }}>{money(balance + pendingFee)}</b></span>'

old_after_line = '{cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + total)}</b></span>}'
new_after_line = '{cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + pendingFee + total)}</b></span>}'

code = code.replace(old_balance_line, new_balance_line)
code = code.replace(old_after_line, new_after_line)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated InpatientBillingWorkflow balance display")

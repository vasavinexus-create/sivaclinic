# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. Remove pending doctor fee span from balance banner
old_fee_span = '\n      {pending.length > 0 && <span style={{ color: "#c53030" }}>Pending doctor fee ({pending.length}): <b>{money(pendingFee)}</b></span>}'
code = code.replace(old_fee_span, '')

# 2. Remove the red doctor fee banner below entry line
old_banner = '\n    {pending.length > 0 && <div className="fee-banner auth-message" style={{ marginBottom: "16px", background: "#fff5f5", color: "#c53030", padding: "12px", borderRadius: "8px", border: "1px solid #fed7d7" }}>Pending doctor fee ({pending.length} consultation{pending.length > 1 ? "s" : ""}) will be added to ledger: <b>{money(pendingFee)}</b></div>}'
code = code.replace(old_banner, '')

# 3. Remove "Medicine bill:" duplicate in balance banner
old_medicine_bill = '\n      {cart.length > 0 && <span>Medicine bill: <b>{money(medicineTotal)}</b></span>}'
code = code.replace(old_medicine_bill, '')

# 4. Remove heading total (the red ₹78.22 at top)
old_heading = '<h1>Inpatient Billing {cart.length > 0 && <span className="billing-head-total">{money(medicineTotal)}</span>}</h1>'
new_heading = '<h1>Inpatient Billing</h1>'
code = code.replace(old_heading, new_heading)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done!")

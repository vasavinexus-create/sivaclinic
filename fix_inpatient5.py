# -*- coding: utf-8 -*-
import codecs, re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. grandTotal should just be medicineTotal (no doctor fee in bill)
old_total = '  const grandTotal = medicineTotal + pendingFee;'
new_total = '  const grandTotal = medicineTotal; // doctor fee posted separately to ledger'
code = code.replace(old_total, new_total)

# 2. Remove doctor_fee from sale insert
old_insert = '      doctor_fee: pendingFee, grand_total: grandTotal, payment_mode: "credit",'
new_insert = '      doctor_fee: 0, grand_total: medicineTotal, payment_mode: "credit",'
code = code.replace(old_insert, new_insert)

# 3. Heading: remove grandTotal reference (was showing with doctor fee)
old_heading = '<h1>Inpatient Billing {cart.length > 0 && <span className="billing-head-total">{money(grandTotal)}</span>}</h1>'
new_heading = '<h1>Inpatient Billing {cart.length > 0 && <span className="billing-head-total">{money(medicineTotal)}</span>}</h1>'
code = code.replace(old_heading, new_heading)

# 4. Balance banner: remove "Total charged now" (which included fee)
old_balance_total = '      {cart.length > 0 && <span>Total charged now: <b>{money(grandTotal)}</b></span>}'
new_balance_total = '      {cart.length > 0 && <span>Medicine bill: <b>{money(medicineTotal)}</b></span>}'
code = code.replace(old_balance_total, new_balance_total)

# 5. Balance after: use medicineTotal only
old_balance_after = '      {cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + grandTotal)}</b></span>}'
new_balance_after = '      {cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + medicineTotal + pendingFee)}</b></span>}'
code = code.replace(old_balance_after, new_balance_after)

# 6. Checkout totals: remove doctor fee line
old_checkout = '<div className="totals-mini">{pending.length > 0 && <span>Medicine <b>{money(medicineTotal)}</b></span>}{pending.length > 0 && <span>Doctor fee <b>{money(pendingFee)}</b></span>}<strong>Grand total <b>{money(grandTotal)}</b></strong>}</div>'
new_checkout = '<div className="totals-mini"><strong>Bill total <b>{money(medicineTotal)}</b></strong></div>'
code = code.replace(old_checkout, new_checkout)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done!")

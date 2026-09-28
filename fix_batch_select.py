# -*- coding: utf-8 -*-
import codecs, re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# ── Fix outpatient BillingWorkflow add() ──────────────────────────────────────
# 1. Remove units_per_purchase_unit from select
old_billing_select = '"id,batch_number,expiry_date,current_stock,selling_rate,mrp,gst_percent,units_per_purchase_unit,sales_discount_percent"'
new_billing_select = '"id,batch_number,expiry_date,current_stock,selling_rate,mrp,gst_percent,sales_discount_percent"'

# 2. Fix rate calc - selling_rate is already the correct sale unit rate
old_billing_rate = 'const originalRate = discountedSaleRate(data.mrp, data.units_per_purchase_unit, discount);'
new_billing_rate = 'const originalRate = discountedSaleRate(data.selling_rate, 1, discount);'

# 3. Fix mrp_unit_rate in cart item (ceiling of selling_rate before discount)
old_billing_cart = 'mrp_unit_rate: roundedSaleRate(data.mrp, data.units_per_purchase_unit),'
new_billing_cart = 'mrp_unit_rate: Math.ceil(Number(data.selling_rate)),'

# 4. Fix changeDiscount in BillingWorkflow
old_cd = 'const sellingRate = discountedSaleRate(item.mrp, item.units_per_purchase_unit, value);'
new_cd = 'const sellingRate = discountedSaleRate(item.mrp_unit_rate || item.selling_rate, 1, value);'

# ── Fix rate-preview useEffect ─────────────────────────────────────────────────
# The rate preview useEffect also uses units_per_purchase_unit
old_preview_select = '"mrp,units_per_purchase_unit,sales_discount_percent,gst_percent"'
new_preview_select = '"mrp,selling_rate,sales_discount_percent,gst_percent"'

old_preview_rate = 'const finalRate = discountedSaleRate(data.mrp, data.units_per_purchase_unit, discount);'
new_preview_rate = 'const finalRate = discountedSaleRate(data.selling_rate, 1, discount);'

old_preview_mrp = 'setRatePreview({ mrp_unit_rate: roundedSaleRate(data.mrp, data.units_per_purchase_unit),'
new_preview_mrp = 'setRatePreview({ mrp_unit_rate: Math.ceil(Number(data.selling_rate)),'

# Apply all replacements
fixes = [
    ('outpatient batch select', old_billing_select, new_billing_select),
    ('outpatient rate calc', old_billing_rate, new_billing_rate),
    ('outpatient mrp_unit_rate', old_billing_cart, new_billing_cart),
    ('changeDiscount', old_cd, new_cd),
    ('preview select', old_preview_select, new_preview_select),
    ('preview rate', old_preview_rate, new_preview_rate),
    ('preview mrp_unit_rate', old_preview_mrp, new_preview_mrp),
]

for name, old, new in fixes:
    if old in code:
        code = code.replace(old, new)
        print(f"Fixed: {name}")
    else:
        print(f"NOT FOUND: {name}")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done!")

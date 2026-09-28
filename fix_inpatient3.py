# -*- coding: utf-8 -*-
import codecs, re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Find and fix the inpatient add() batch select - remove units_per_purchase_unit
# Replace the specific select string in InpatientBillingWorkflow
old_select = '"id,batch_number,expiry_date,current_stock,selling_rate,mrp,mrp_unit_rate,units_per_purchase_unit,sales_discount_percent,gst_percent"'
new_select = '"id,batch_number,expiry_date,current_stock,mrp_unit_rate,mrp,selling_rate,sales_discount_percent,gst_percent"'

# Also fix the rate calculation that uses units_per_purchase_unit
old_rate = 'const sellingRate = Number((Number(data.mrp) / Math.max(1, Number(data.units_per_purchase_unit)) * (1 - discountPct / 100)).toFixed(2));'
new_rate = 'const sellingRate = Number((Number(data.mrp_unit_rate || data.selling_rate) * (1 - discountPct / 100)).toFixed(2));'

if old_select in code:
    code = code.replace(old_select, new_select)
    print("Fixed select!")
else:
    print("select not found")

if old_rate in code:
    code = code.replace(old_rate, new_rate)
    print("Fixed rate calculation!")
else:
    print("rate calc not found")
    # show what's around selling rate
    idx = code.find('InpatientBillingWorkflow')
    sub = code[idx:idx+5000]
    m = re.search(r'const sellingRate.*?;', sub)
    if m:
        print("Found:", m.group(0))

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done!")

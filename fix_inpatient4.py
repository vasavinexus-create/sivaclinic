# -*- coding: utf-8 -*-
import codecs, re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Fix: remove mrp_unit_rate from medicine_batches select (it only exists on sale_items)
old_select = '"id,batch_number,expiry_date,current_stock,mrp_unit_rate,mrp,selling_rate,sales_discount_percent,gst_percent"'
new_select = '"id,batch_number,expiry_date,current_stock,mrp,selling_rate,sales_discount_percent,gst_percent"'

# Fix rate calc - use mrp directly as the base unit rate (selling_rate is already computed on batch)
old_rate = 'const sellingRate = Number((Number(data.mrp_unit_rate || data.selling_rate) * (1 - discountPct / 100)).toFixed(2));'
new_rate = 'const sellingRate = Number((Number(data.selling_rate)).toFixed(2));'

if old_select in code:
    code = code.replace(old_select, new_select)
    print("Fixed select!")
else:
    print("select not found")

if old_rate in code:
    code = code.replace(old_rate, new_rate)
    print("Fixed rate calculation!")
else:
    # show what's there
    idx = code.find('InpatientBillingWorkflow')
    sub = code[idx:idx+5000]
    m = re.search(r'const sellingRate.*?;', sub)
    if m:
        print("Current rate line:", m.group(0))

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done!")

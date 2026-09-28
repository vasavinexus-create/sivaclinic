# -*- coding: utf-8 -*-
import codecs, re

# Update PurchaseWorkflows.tsx to calculate selling_rate and send sales_discount_percent
path = 'app/v2/components/PurchaseWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. addItem calculation
old_add = 'sales_discount_percent: salesDiscount, selling_rate: 0, mrp: Number(data.get("mrp") || 0),'
new_add = 'sales_discount_percent: salesDiscount, selling_rate: Number(data.get("mrp") || 0) / units, mrp: Number(data.get("mrp") || 0),'
if old_add in code: code = code.replace(old_add, new_add)

# 2. save function payload
old_payload = '''selling_rate: item.selling_rate || 0,
          gst_percent: item.gst_percent,'''
new_payload = '''selling_rate: item.selling_rate || 0,
          sales_discount_percent: item.sales_discount_percent,
          gst_percent: item.gst_percent,'''
if old_payload in code: code = code.replace(old_payload, new_payload)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("PurchaseWorkflows.tsx patched.")

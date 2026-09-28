# -*- coding: utf-8 -*-
import codecs, re

path = 'app/api/v2/purchases/route.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. Update schema
old_schema = '''  selling_rate: z.number().min(0),
  gst_percent: z.number().min(0).optional(),
});'''
new_schema = '''  selling_rate: z.number().min(0),
  sales_discount_percent: z.number().nullable().optional(),
  gst_percent: z.number().min(0).optional(),
});'''
if old_schema in code: code = code.replace(old_schema, new_schema)

# 2. Update insert
old_insert = '''        selling_rate: item.selling_rate,
        initial_stock: totalQty,'''
new_insert = '''        selling_rate: item.selling_rate,
        sales_discount_percent: item.sales_discount_percent,
        initial_stock: totalQty,'''
if old_insert in code: code = code.replace(old_insert, new_insert)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("api/v2/purchases/route.ts patched.")

# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Replace the specific div content
old_stock_str = """<div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Current Stock: {(() => {
  const v = valueAt(r, 'current_stock') || 0;
  const c = r.product?.default_units_per_purchase_unit || 1;
  const p = Math.floor(v / c);
  const m = v % c;
  const u = r.product?.purchase_unit || 'Pack';
  return m > 0 ? `${p} ${u} + ${m}` : `${p} ${u}`;
})()} | Batch: {valueAt(r, 'batch_number')}</div>"""
new_stock_str = """<div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Unit: {r.product?.purchase_unit || 'Pack'}</div>"""

code = code.replace(old_stock_str, new_stock_str)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Updated PO description")

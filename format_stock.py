# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/lib/modules.ts', 'r', 'utf-8') as f:
    modules = f.read()

# Update select queries for low-stock and expiry-alerts to include conversion fields
modules = modules.replace(
    'product:products(name)',
    'product:products(name,default_units_per_purchase_unit,purchase_unit)'
)

with codecs.open('app/v2/lib/modules.ts', 'w', 'utf-8') as f:
    f.write(modules)
    
print("Updated modules.ts")


with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# 1. Update renderCell
render_search = """function renderCell(row: Row, key: string) {"""
render_replace = """function renderCell(row: Row, key: string, moduleKey?: string) {
  if (key === "current_stock" && (moduleKey === "low-stock" || moduleKey === "expiry-alerts")) {
    const val = valueAt(row, key) || 0;
    const conv = row.product?.default_units_per_purchase_unit || 1;
    const packs = Math.floor(val / conv);
    const rem = val % conv;
    const unit = row.product?.purchase_unit || "Pack";
    return rem > 0 ? `${packs} ${unit} + ${rem}` : `${packs} ${unit}`;
  }"""
code = code.replace(render_search, render_replace)

# Also update the call site of renderCell in PagedCrud to pass module.key
call_search = """{renderCell(row, key)}"""
call_replace = """{renderCell(row, key, module.key)}"""
code = code.replace(call_search, call_replace)

# 2. Update the Print Layout (Low Stock)
po_stock_search = """Current Stock: {valueAt(r, 'current_stock')} | Batch: {valueAt(r, 'batch_number')}"""
po_stock_replace = """Current Stock: {(() => {
  const v = valueAt(r, 'current_stock') || 0;
  const c = r.product?.default_units_per_purchase_unit || 1;
  const p = Math.floor(v / c);
  const m = v % c;
  const u = r.product?.purchase_unit || 'Pack';
  return m > 0 ? `${p} ${u} + ${m}` : `${p} ${u}`;
})()} | Batch: {valueAt(r, 'batch_number')}"""
code = code.replace(po_stock_search, po_stock_replace)

# 3. Update the Print Layout (Expiry Alerts)
exp_stock_search = """<td style={{ padding: 12, border: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{valueAt(r, "current_stock")}</td>"""
exp_stock_replace = """<td style={{ padding: 12, border: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{(() => {
  const v = valueAt(r, 'current_stock') || 0;
  const c = r.product?.default_units_per_purchase_unit || 1;
  const p = Math.floor(v / c);
  const m = v % c;
  const u = r.product?.purchase_unit || 'Pack';
  return m > 0 ? `${p} ${u} + ${m}` : `${p} ${u}`;
})()}</td>"""
code = code.replace(exp_stock_search, exp_stock_replace)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)
    
print("Updated PagedCrud.tsx")

import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Fix productText
code = code.replace(
    'const productText = (row: Row) => ${row.product_id || ""} - ;',
    'const productText = (row: Row) => ${row.name || ""};'
)

# Fix <td> classes in BillingWorkflow
import re
code = re.sub(
    r'<tr key=\{\\$\{item\.batch_id\}-\$\{index\}\\}><td>\{item\.name\}</td><td>\{item\.batch_number\}</td><td>\{item\.qty\}</td><td>\{money\(item\.mrp_unit_rate\)\}</td><td><input className="table-qty-input" type="number" min="0" max="100" step="0\.01" value=\{item\.sales_discount_percent \?\? 0\} onChange=\{\(event\) => changeDiscount\(index, Number\(event\.currentTarget\.value\)\)\}/></td><td>\{money\(item\.selling_rate\)\}</td><td>\{Number\(item\.gst_percent \|\| 0\)\}%</td><td>\{money\(Number\(item\.selling_rate\) \* Number\(item\.qty\)\)\}</td><td><button className="table-edit danger-btn" onClick=\{\(\) => setCart\(\(items\) => items\.filter\(\(_, i\) => i !== index\)\)\}><Trash2 size=\{14\}/></button></td></tr>',
    '<tr key={${item.batch_id}-} className="cart-row-interactive"><td className="col-med"><strong>{item.name}</strong></td><td className="col-batch">{item.batch_number}</td><td className="col-qty"><input className="table-qty-input" type="number" min="1" step="1" value={item.qty} onChange={(event) => changeQty(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.mrp_unit_rate)}</td><td className="col-rate"><input className="table-qty-input" type="number" min="0" max="100" step="0.01" value={item.sales_discount_percent ?? 0} onChange={(event) => changeDiscount(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.selling_rate)}</td><td className="col-gst">{Number(item.gst_percent || 0)}%</td><td className="col-total"><strong>{money(Number(item.selling_rate) * Number(item.qty))}</strong></td><td className="col-action"><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>',
    code
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

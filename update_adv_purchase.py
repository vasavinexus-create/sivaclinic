# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

# 1. Add save_mapping to StagingItem
code = code.replace('review_reason?: string;', 'review_reason?: string;\n  save_mapping?: boolean;')

# 2. Add rateIncludesGst state
state_search = 'const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));'
state_replace = state_search + '\n  const [rateIncludesGst, setRateIncludesGst] = useState<boolean>(false);'
code = code.replace(state_search, state_replace)

# 3. Add tax mode select in the header
header_search = '<Field name="invoice_number" label="Invoice Number" value={invoiceNumber}'
header_replace = '<label className="field"><span>Tax Mode</span><select value={rateIncludesGst ? "included" : "excluded"} onChange={(e) => setRateIncludesGst(e.target.value === "included")}><option value="excluded">Rate Excludes GST (Rate * Qty + GST)</option><option value="included">Rate Includes GST (Rate * Qty = Total)</option></select></label>\n              ' + header_search
code = code.replace(header_search, header_replace)

# 4. Add 'save_mapping' checkbox in Modal 1
modal_search = '{/* If Mapped, show the unit settings panel */}'
modal_replace = '<label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", background: "#f0fdf4", padding: "10px", borderRadius: "8px", marginBottom: "14px", border: "1px solid #bbf7d0" }}><input type="checkbox" checked={items[editingItemIndex].save_mapping !== false} onChange={(e) => { const checked = e.target.checked; setItems(rows => { const copy = [...rows]; copy[editingItemIndex].save_mapping = checked; return copy; }); }} /> Save this description to Product Mappings for future auto-mapping</label>\n            ' + modal_search
code = code.replace(modal_search, modal_replace)

# 5. Fix mapping saving to respect save_mapping
save_mapping_search = 'if (item.supplier_description && item.mapped_product_id) {'
save_mapping_replace = 'if (item.supplier_description && item.mapped_product_id && item.save_mapping !== false) {'
code = code.replace(save_mapping_search, save_mapping_replace)

# 6. Delete draft on approval success
draft_search = 'setStep("approved");'
draft_replace = 'if (currentDraftId) await supabase.from("purchase_imports").delete().eq("id", currentDraftId);\n      setStep("approved");'
code = code.replace(draft_search, draft_replace)


# 7. Make the table editable and add Add/Delete Row buttons
# First, let's locate the Add Pages (Append) button to add the "Add Manual Row" button next to it.
add_row_search = '<Plus size={16} /> Add Pages (Append)'
add_row_replace = add_row_search + '\n                  </label>\n                  <button className="secondary" onClick={() => {\n                    setItems([...items, {\n                      line_no: items.length + 1,\n                      supplier_description: "",\n                      normalized_description: "",\n                      batch_no: "",\n                      expiry_date: "",\n                      quantity: 1,\n                      free_quantity: 0,\n                      purchase_unit: "unit",\n                      sale_unit: "unit",\n                      units_per_purchase_unit: 1,\n                      rate: 0,\n                      purchase_rate_per_unit: 0,\n                      mrp: 0,\n                      selling_rate: 0,\n                      discount_percent: 0,\n                      discount_amount: 0,\n                      gst_percent: 0,\n                      line_total: 0,\n                      mapped_product_id: null,\n                      mapping_source: "unmapped",\n                      mapping_status: "unmapped",\n                      requires_review: true\n                    }]);\n                  }}>\n                    <Plus size={16} /> Add Item Manually\n                  </button>'
code = re.sub(r'<Plus size=\{16\} /> Add Pages \(Append\).*?</label>', add_row_replace, code, flags=re.DOTALL)


# Now let's transform the table row cells to be inputs.
# Original:
# <td>
#   <strong>{item.supplier_description}</strong>
#   {item.product_code && <div style={{ fontSize: "11px", color: "var(--muted)" }}>Code: {item.product_code}</div>}
# </td>
# We need to replace `<strong>{item.supplier_description}</strong>` with an input.

code = code.replace('<strong>{item.supplier_description}</strong>', '<input aria-label="Description" value={item.supplier_description} placeholder="Description" style={{ width: "200px", fontWeight: "bold" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, supplier_description: e.target.value } : r))} />')

# Qty + Free cell:
# Original: {item.quantity} {item.free_quantity > 0 ? `+ ${item.free_quantity} free` : ""}
# Let's replace the whole td: <td className="col-qty">...</td> (if it has class) - wait, it doesn't have class.
# Let's replace using regex on that specific cell structure.
qty_cell_search = r'<td>\s*\{item\.quantity\} \{item\.free_quantity > 0 \? `\+ \$\{item\.free_quantity\} free` : ""\}\s*</td>'
qty_cell_replace = r'''<td>
                          <div style={{ display: "flex", gap: "4px", width: "120px" }}>
                            <input type="number" aria-label="Qty" value={item.quantity || ""} placeholder="Qty" style={{ width: "50%" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, quantity: Number(e.target.value) } : r))} />
                            <input type="number" aria-label="Free Qty" value={item.free_quantity || ""} placeholder="Free" style={{ width: "50%" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, free_quantity: Number(e.target.value) } : r))} />
                          </div>
                        </td>'''
code = re.sub(qty_cell_search, qty_cell_replace, code)


# Rate cell:
# Original: <td>{money(item.rate)}</td> -> change to input
rate_cell_search = r'<td>\{money\(item\.rate\)\}</td>'
rate_cell_replace = r'''<td><input type="number" step="0.01" aria-label="Rate" value={item.rate || ""} style={{ width: "70px" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, rate: Number(e.target.value) } : r))} /></td>'''
code = re.sub(rate_cell_search, rate_cell_replace, code)


# MRP cell:
# Original: <td>{money(item.mrp)}</td>
mrp_cell_search = r'<td>\{money\(item\.mrp\)\}</td>'
mrp_cell_replace = r'''<td><input type="number" step="0.01" aria-label="MRP" value={item.mrp || ""} style={{ width: "70px" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, mrp: Number(e.target.value), selling_rate: Number(e.target.value) } : r))} /></td>'''
code = re.sub(mrp_cell_search, mrp_cell_replace, code)

# GST % cell:
# Original: <td>{item.gst_percent}%</td>
gst_cell_search = r'<td>\{item\.gst_percent\}%</td>'
gst_cell_replace = r'''<td><input type="number" aria-label="GST %" value={item.gst_percent || ""} style={{ width: "50px" }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, gst_percent: Number(e.target.value) } : r))} /></td>'''
code = re.sub(gst_cell_search, gst_cell_replace, code)

# Line Total cell:
# Original:
# <td>
#   <strong style={{ color: Math.abs(((item.quantity * item.rate - item.discount_amount) * (1 + item.gst_percent / 100)) - item.line_total) > 1 ? "#dc2626" : undefined }}>
#     {money(item.line_total)}
#   </strong>
# </td>
total_cell_search = r'<td>\s*<strong style={{ color: Math\.abs.*?}}\s*>\s*\{money\(item\.line_total\)\}\s*</strong>\s*</td>'
total_cell_replace = r'''<td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <input type="number" step="0.01" aria-label="Line Total" value={item.line_total || ""} style={{ width: "85px", fontWeight: "bold", border: Math.abs(((item.quantity * item.rate - item.discount_amount) * (rateIncludesGst ? 1 : (1 + item.gst_percent / 100))) - item.line_total) > 1 ? "1px solid #dc2626" : undefined }} onChange={(e) => setItems(rows => rows.map((r, i) => i === originalIndex ? { ...r, line_total: Number(e.target.value) } : r))} />
                            {Math.abs(((item.quantity * item.rate - item.discount_amount) * (rateIncludesGst ? 1 : (1 + item.gst_percent / 100))) - item.line_total) > 1 && (
                              <span style={{ fontSize: "10px", color: "#dc2626" }}>Expected: {money(((item.quantity * item.rate - item.discount_amount) * (rateIncludesGst ? 1 : (1 + item.gst_percent / 100))))}</span>
                            )}
                          </div>
                        </td>'''
code = re.sub(total_cell_search, total_cell_replace, code, flags=re.DOTALL)


# Also add a trash icon cell for deletion at the very end of the row
header_search = r'<th>Status</th>'
header_replace = r'<th>Status</th><th>Del</th>'
code = re.sub(header_search, header_replace, code)

row_end_search = r'(<span.*?Badge.*?</span>.*?</td>)'
row_end_replace = r'\1\n                        <td><button className="table-edit danger-btn" onClick={() => setItems(rows => rows.filter((_, i) => i !== originalIndex))}><Trash2 size={14}/></button></td>'
code = re.sub(row_end_search, row_end_replace, code, flags=re.DOTALL)


with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Modifications written.")

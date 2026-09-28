import codecs

path = 'app/v2/components/SalesWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Add states
old_state = '  const [rows, setRows] = useState<Row[]>([]);\n  const [loading, setLoading] = useState(false);'
new_state = '''  const [tab, setTab] = useState<"completed" | "cancelled">("completed");
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);'''
code = code.replace(old_state, new_state)

# Update load query
old_query = 'supabase.from("sales").select("id,invoice_no,sold_at,grand_total,pharmacy_revenue,doctor_fee,payment_mode,status,sale_type,patient:patients(patient_id,name,mobile),sale_items(id,product_id,batch_id,quantity,batch:medicine_batches(current_stock))").order("sold_at", { ascending: false }).limit(200)'
new_query = 'supabase.from("sales").select("id,invoice_no,sold_at,grand_total,pharmacy_revenue,doctor_fee,payment_mode,status,sale_type,patient:patients(patient_id,name,mobile),sale_items(id,product_id,batch_id,quantity,batch:medicine_batches(current_stock))").eq("status", tab).gte("sold_at", date + "T00:00:00").lte("sold_at", date + "T23:59:59").order("sold_at", { ascending: false }).limit(200)'
code = code.replace(old_query, new_query)

# Update useEffect
old_effect = '  useEffect(load, []);'
new_effect = '  useEffect(load, [tab, date]);'
code = code.replace(old_effect, new_effect)

# Update UI Panel
old_panel = '</div></div><div className="panel">{loading ?'
new_panel = '''</div></div><div className="panel">
<div className="tab-row" style={{marginBottom:"16px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
  <div>
    <button className={tab==="completed"?"active":""} onClick={()=>setTab("completed")}>Completed</button>
    <button className={tab==="cancelled"?"active":""} onClick={()=>setTab("cancelled")}>Cancelled</button>
  </div>
  <form onSubmit={(e) => { e.preventDefault(); setDate(dateInput); }} style={{display: "flex", gap: "8px"}}>
    <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} required />
    <button type="submit" className="primary">Load</button>
  </form>
</div>
{loading ?'''
code = code.replace(old_panel, new_panel)

# Update action button
old_btn = '<td>{canDeleteBill(profile.role, sale.sold_at, sale.status) ? <button className="table-edit danger-btn" onClick={() => cancelSale(sale)}><Trash2 size={14}/> Cancel</button> : "-"}</td>'
new_btn = '<td>{tab === "completed" && canDeleteBill(profile.role, sale.sold_at, sale.status) ? <button className="table-edit danger-btn" onClick={() => cancelSale(sale)}><Trash2 size={14}/> Cancel</button> : "-"}</td>'
code = code.replace(old_btn, new_btn)

# Update empty state
old_empty = '<div className="empty"><h3>No sales found.</h3><p>Completed sales will appear here.</p></div>'
new_empty = '<div className="empty"><h3>{tab === "completed" ? "No completed sales found." : "No cancelled sales found."}</h3><p>For the selected date.</p></div>'
code = code.replace(old_empty, new_empty)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("SalesWorkflows updated!")

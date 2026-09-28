import codecs

path = 'app/v2/components/VerificationWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. State for tab
old_state = '  const [rows, setRows] = useState<Row[]>([]);\n  const [loading, setLoading] = useState(false);'
new_state = '  const [tab, setTab] = useState<"pending" | "verified">("pending");\n  const [rows, setRows] = useState<Row[]>([]);\n  const [loading, setLoading] = useState(false);'
code = code.replace(old_state, new_state)

# 2. Update load query
old_query = '.eq("has_rate_edit", true).eq("rate_edit_verified", false).'
new_query = '.eq("has_rate_edit", true).eq("rate_edit_verified", tab === "verified").'
code = code.replace(old_query, new_query)

# 3. Reload on tab change
old_effect = '  useEffect(load, []);'
new_effect = '  useEffect(load, [tab]);'
code = code.replace(old_effect, new_effect)

# 4. Add UI Tabs and conditionally show Verify button
old_panel = '</div></div><div className="panel">{loading ?'
new_panel = '</div></div><div className="panel"><div className="tab-row" style={{marginBottom:"16px"}}><button className={tab==="pending"?"active":""} onClick={()=>setTab("pending")}>Pending verification</button><button className={tab==="verified"?"active":""} onClick={()=>setTab("verified")}>Verified</button></div>{loading ?'
code = code.replace(old_panel, new_panel)

old_btn = '<td><button className="table-edit" onClick={() => verify(row)}><CheckCircle2 size={14}/> Verify</button></td>'
new_btn = '<td>{tab === "pending" ? <button className="table-edit" onClick={() => verify(row)}><CheckCircle2 size={14}/> Verify</button> : "Verified"}</td>'
code = code.replace(old_btn, new_btn)

old_empty = '<div className="empty"><h3>No bills pending verification.</h3><p>Edited-rate bills will appear here.</p></div>'
new_empty = '<div className="empty"><h3>{tab === "pending" ? "No bills pending verification." : "No verified bills."}</h3><p>Edited-rate bills will appear here.</p></div>'
code = code.replace(old_empty, new_empty)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("VerificationWorkflows updated!")

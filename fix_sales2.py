import codecs

path = 'app/v2/components/SalesWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Replace single date state with from/to
old_state = '''  const [dateInput, setDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));'''
new_state = '''  const [fromInput, setFromInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [toInput, setToInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));'''
code = code.replace(old_state, new_state)

# Update query
old_query = '.gte("sold_at", date + "T00:00:00").lte("sold_at", date + "T23:59:59")'
new_query = '.gte("sold_at", fromDate + "T00:00:00").lte("sold_at", toDate + "T23:59:59")'
code = code.replace(old_query, new_query)

# Update effect
old_effect = '  useEffect(load, [tab, date]);'
new_effect = '  useEffect(load, [tab, fromDate, toDate]);'
code = code.replace(old_effect, new_effect)

# Replace date filter form
old_form = '''  <form onSubmit={(e) => { e.preventDefault(); setDate(dateInput); }} style={{display: "flex", gap: "8px"}}>
    <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} required />
    <button type="submit" className="primary">Load</button>
  </form>'''
new_form = '''  <form onSubmit={(e) => { e.preventDefault(); setFromDate(fromInput); setToDate(toInput); }} style={{display: "flex", gap: "8px", alignItems: "center"}}>
    <label style={{fontSize:"13px", margin:0}}>From</label>
    <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} required />
    <label style={{fontSize:"13px", margin:0}}>To</label>
    <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} required />
    <button type="submit" className="primary">Load</button>
  </form>'''
code = code.replace(old_form, new_form)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done!")

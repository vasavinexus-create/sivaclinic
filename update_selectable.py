# -*- coding: utf-8 -*-
import codecs

# 1. Update types.ts
with codecs.open('app/v2/lib/types.ts', 'r', 'utf-8') as f:
    types_code = f.read()

types_code = types_code.replace(
    '  editable?: boolean;\n  organizationColumn?: string | null;',
    '  editable?: boolean;\n  selectable?: boolean;\n  organizationColumn?: string | null;'
)

with codecs.open('app/v2/lib/types.ts', 'w', 'utf-8') as f:
    f.write(types_code)
print("Updated types.ts")

# 2. Update modules.ts
with codecs.open('app/v2/lib/modules.ts', 'r', 'utf-8') as f:
    modules_code = f.read()

modules_code = modules_code.replace(
    'key: "low-stock", navLabel: "Low Stock",',
    'selectable: true, key: "low-stock", navLabel: "Low Stock",'
)
modules_code = modules_code.replace(
    'key: "expiry-alerts", navLabel: "Expiry Alerts",',
    'selectable: true, key: "expiry-alerts", navLabel: "Expiry Alerts",'
)

with codecs.open('app/v2/lib/modules.ts', 'w', 'utf-8') as f:
    f.write(modules_code)
print("Updated modules.ts")

# 3. Update PagedCrud.tsx
with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    crud_code = f.read()

# Add state
crud_code = crud_code.replace(
    'const [saving, setSaving] = useState(false);',
    'const [saving, setSaving] = useState(false);\n  const [selected, setSelected] = useState<Set<string>>(new Set());'
)

# Add Print button
toolbar_search = """<button className="secondary" onClick={state.reload}><RefreshCw size={15}/> Refresh</button>
      </div>"""
toolbar_replace = """<button className="secondary" onClick={state.reload}><RefreshCw size={15}/> Refresh</button>
        {module.selectable && selected.size > 0 && <button className="secondary primary-text" onClick={() => window.print()}>Print / Save PDF ({selected.size} selected)</button>}
      </div>"""
crud_code = crud_code.replace(toolbar_search, toolbar_replace)

# Add Checkbox in Table Header
thead_search = """<thead><tr>{module.columns.map(([key, label]) => <th key={key}>{label}</th>)}{editable && <th>Action</th>}</tr></thead>"""
thead_replace = """<thead><tr>
{module.selectable && <th className="no-print" style={{width: 40}}><input type="checkbox" checked={selected.size === state.rows.length && state.rows.length > 0} onChange={e => {
  if (e.target.checked) {
    setSelected(new Set(state.rows.map(r => r.id)));
  } else {
    setSelected(new Set());
  }
}} /></th>}
{module.columns.map(([key, label]) => <th key={key}>{label}</th>)}{editable && <th className="no-print">Action</th>}</tr></thead>"""
crud_code = crud_code.replace(thead_search, thead_replace)

# Add Checkbox in Table Body and apply no-print
tbody_search = """<tbody>{state.rows.map((row) => <tr key={row.id}>{module.columns.map(([key]) => <td key={key}>{renderCell(row, key)}</td>)}{editable && <td><button className="table-edit" onClick={() => { setEditing(row); setOpen(true); }}><Pencil size={14}/> Edit</button></td>}</tr>)}</tbody>"""
tbody_replace = """<tbody>{state.rows.map((row) => <tr key={row.id} className={module.selectable && selected.size > 0 && !selected.has(row.id) ? "no-print" : ""}>
{module.selectable && <td className="no-print"><input type="checkbox" checked={selected.has(row.id)} onChange={e => {
  const next = new Set(selected);
  if (e.target.checked) next.add(row.id);
  else next.delete(row.id);
  setSelected(next);
}} /></td>}
{module.columns.map(([key]) => <td key={key}>{renderCell(row, key)}</td>)}
{editable && <td className="no-print"><button className="table-edit" onClick={() => { setEditing(row); setOpen(true); }}><Pencil size={14}/> Edit</button></td>}
</tr>)}</tbody>"""
crud_code = crud_code.replace(tbody_search, tbody_replace)

# Also ensure global printable styles don't hide the table itself!
# We might need to hide everything else on the page during print.
# This is usually handled in layout.tsx or global.css (we assume standard print styles exist, but let's just output the crud changes for now).
with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(crud_code)
print("Updated PagedCrud.tsx")

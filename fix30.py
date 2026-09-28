import codecs

path = 'app/v2/components/controls.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Update signature
old_sig = 'export function AsyncSelect({ table, select, searchColumns, label, value, onChange, render, placeholder = "Search" }: { table: string; select: string; searchColumns: string[]; label: string; value: string; onChange: (id: string, row?: Row) => void; render: (row: Row) => string; placeholder?: string }) {'
new_sig = 'export function AsyncSelect({ table, select, searchColumns, label, value, onChange, render, placeholder = "Search", orderBy = "name" }: { table: string; select: string; searchColumns: string[]; label: string; value: string; onChange: (id: string, row?: Row) => void; render: (row: Row) => string; placeholder?: string; orderBy?: string }) {'

code = code.replace(old_sig, new_sig)

# Update offline query 1
old_q1 = 'powerSync.getAll(`SELECT * FROM ${table} LIMIT 20`).then(data => {'
new_q1 = 'powerSync.getAll(`SELECT * FROM ${table} ORDER BY ${orderBy} ASC LIMIT 20`).then(data => {'
code = code.replace(old_q1, new_q1)

# Update offline query 2
old_q2 = 'powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} LIMIT 20`, params).then(data => {'
new_q2 = 'powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} ORDER BY ${orderBy} ASC LIMIT 20`, params).then(data => {'
code = code.replace(old_q2, new_q2)

# Update online query
old_supa = '''        if (term) {
          const orFilter = searchColumns.map(col => `${col}.ilike.%${query.trim()}%`).join(",");
          q = q.or(orFilter);
        }
        q.limit(20).then(({ data }) => {'''

new_supa = '''        if (term) {
          const orFilter = searchColumns.map(col => `${col}.ilike.%${query.trim()}%`).join(",");
          q = q.or(orFilter);
        }
        q.order(orderBy, { ascending: true }).limit(20).then(({ data }) => {'''

code = code.replace(old_supa, new_supa)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

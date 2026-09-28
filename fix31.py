import codecs

path = 'app/v2/components/controls.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_query = """        } else {
          const condition = searchColumns.map(col => `${col} LIKE ?`).join(" OR ");
          const params = searchColumns.map(() => term);
          powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} ORDER BY ${orderBy} ASC LIMIT 20`, params).then(data => {
            if (alive) setRows(data as Row[]);
          });
        }"""

new_query = """        } else {
          const condition = searchColumns.map(col => `${col} LIKE ?`).join(" OR ");
          const params = searchColumns.map(() => term);
          powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} ORDER BY CASE WHEN ${orderBy} LIKE ? THEN 0 ELSE 1 END, ${orderBy} ASC LIMIT 20`, [...params, `${query.trim()}%`]).then(data => {
            if (alive) setRows(data as Row[]);
          });
        }"""

if old_query in code:
    code = code.replace(old_query, new_query)
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(code)
    print("Fixed PowerSync query!")
else:
    print("Could not find old_query")

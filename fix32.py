import codecs

path = 'app/v2/components/controls.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_str = "powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} ORDER BY ${orderBy} ASC LIMIT 20`, params).then(data => {"
new_str = "powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} ORDER BY CASE WHEN ${orderBy} LIKE ? THEN 0 ELSE 1 END, ${orderBy} ASC LIMIT 20`, [...params, `${query.trim()}%`]).then(data => {"

code = code.replace(old_str, new_str)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done")

import codecs

path = 'app/v2/components/controls.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'onClick={() => { onChange(row.id, row); setQuery(render(row)); setOpen(false); }}',
    'onMouseDown={(e) => { e.preventDefault(); onChange(row.id, row); setQuery(render(row)); setOpen(false); }} onClick={() => { onChange(row.id, row); setQuery(render(row)); setOpen(false); }}'
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

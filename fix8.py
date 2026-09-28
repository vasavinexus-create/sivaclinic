import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'return `${row.product_id || ""} - ${row.name || ""}`;',
    'return `${row.name || ""}`;'
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

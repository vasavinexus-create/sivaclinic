import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Fix productText
code = re.sub(
    r'function productText\(row: Row\) \{\s*return \$\{row\.product_id \|\| ""\} - \$\{row\.name \|\| ""\};\s*\}',
    'function productText(row: Row) {\n  return ${row.name || ""};\n}',
    code
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'const invoice = `V2--`;',
    'const invoice = `V2-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;'
)
with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

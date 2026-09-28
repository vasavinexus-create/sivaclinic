import codecs

path = 'app/v2/components/controls.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Fix 1: Clear value when typing
code = code.replace(
    'onChange={(event) => setQuery(event.currentTarget.value)}',
    'onChange={(event) => { setQuery(event.currentTarget.value); if (value) onChange("", undefined); }}'
)

# Fix 2: Don't show list if value is set
code = code.replace(
    '{open && rows.length > 0 && (',
    '{open && !value && rows.length > 0 && ('
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

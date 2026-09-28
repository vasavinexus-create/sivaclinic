import codecs

path = 'app/v2/components/controls.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_hook = """  useEffect(() => {
    let alive = true;"""

new_hook = """  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    let alive = true;"""

code = code.replace(old_hook, new_hook)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

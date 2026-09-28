import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

pattern = r'(\} catch \{\})\s*setSpecialDiscountPercent\(0\);\s*notify\(`\$\{invoice\} saved`\);\s*\};'

replacement = r'''\1
    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    setPatientId("");
    setPending(null);
    notify(`${invoice} saved`);
  };'''

new_code = re.sub(pattern, replacement, code)
if new_code != code:
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(new_code)
    print("Fixed via regex!")
else:
    print("Regex still failed to match!")

# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

pattern = r'(<Plus size=\{16\} /> Add Pages \(Append\))\s*</label>'
replace = r'\1\n                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleAppendUpload} style={{ display: "none" }} />\n                  </label>'

new_code = re.sub(pattern, replace, code)

if new_code != code:
    with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
        f.write(new_code)
    print("Restored the input file element")
else:
    print("Regex did not match")

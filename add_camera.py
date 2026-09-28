# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

# I want to find the Add Pages (Append) block and replace it entirely with two buttons.
pattern = r'<label className="secondary" style={{ cursor: "pointer", marginRight: "auto", display: "flex", alignItems: "center", gap: "6px" }}>\s*<Plus size=\{16\} /> Add Pages \(Append\)\s*<input type="file" multiple accept="\.pdf,\.jpg,\.jpeg,\.png,\.webp" onChange=\{handleAppendUpload\} style=\{\{ display: "none" \}\} />\s*</label>'

replace = r'''<label className="secondary" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}>
                    <Plus size={16} /> File
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleAppendUpload} style={{ display: "none" }} />
                  </label>
                  <label className="secondary" style={{ cursor: "pointer", marginRight: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}>
                    <Camera size={16} /> Camera
                    <input type="file" multiple accept="image/*" capture="environment" onChange={handleAppendUpload} style={{ display: "none" }} />
                  </label>'''

new_code = re.sub(pattern, replace, code)

if new_code != code:
    with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
        f.write(new_code)
    print("Successfully replaced and added Camera Append button.")
else:
    print("Regex match failed.")

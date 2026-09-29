# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Revert my bad replace by doing it backwards
code = code.replace('</table>\n            </div>', '</table>')

# Now carefully do it for ONLY the first one!
idx = code.find('<table className="table">')
if idx > -1:
    code = code[:idx] + '<div className="crud-table-wrap" style={{ overflowX: "auto" }}>\n            <table className="data-table">' + code[idx+25:]
    
    idx_close = code.find('</table>', idx)
    code = code[:idx_close+8] + '\n            </div>' + code[idx_close+8:]

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
    f.write(code)

print('Fixed table specifically')

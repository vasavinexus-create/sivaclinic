# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/V2App.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace('"inpatient-billing":      InpatientBillingWorkflow,', '"inpatient-billing":      InpatientBillingWorkflow,\n  "inpatient-ledger":       InpatientLedgerWorkflow,')

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Added to PAGE_REGISTRY")

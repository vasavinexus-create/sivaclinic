# -*- coding: utf-8 -*-
import codecs
import re

# 1. Clean PharmacyWorkflows.tsx
path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()
code = re.sub(r'export function InpatientLedgerWorkflow.*', '', code, flags=re.DOTALL)
with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

# 2. Clean V2App.tsx
path = 'app/v2/V2App.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace('import { BillingWorkflow, InpatientBillingWorkflow, InpatientLedgerWorkflow } from "./components/PharmacyWorkflows";', 'import { BillingWorkflow, InpatientBillingWorkflow } from "./components/PharmacyWorkflows";')
code = code.replace('"inpatient-ledger":       InpatientLedgerWorkflow,', '')

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Cleaned up duplicates")

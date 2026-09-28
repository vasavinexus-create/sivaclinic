# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/V2App.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Import it
import_statement = "import { BillingWorkflow, InpatientBillingWorkflow, InpatientLedgerWorkflow } from \"./components/PharmacyWorkflows\";"
code = code.replace("import { BillingWorkflow, InpatientBillingWorkflow } from \"./components/PharmacyWorkflows\";", import_statement)

# Add to PAGE_REGISTRY
registry_addition = """const PAGE_REGISTRY: Record<string, any> = {
  "inpatient-ledger":       InpatientLedgerWorkflow,"""
code = code.replace("const PAGE_REGISTRY: Record<string, any> = {", registry_addition)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated V2App.tsx")

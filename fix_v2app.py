import re

with open('app/v2/V2App.tsx', 'r', encoding='utf-8') as f:
    v2app = f.read()

# Add import
if 'ClinicManagementWorkflow' not in v2app:
    v2app = v2app.replace('import { getV2Module', 'import { ClinicManagementWorkflow } from "./components/AdminWorkflows";\nimport { getV2Module')

# Add to PAGE_REGISTRY
if '"clinic-management":' not in v2app:
    v2app = v2app.replace('"settings":               SettingsWorkflow,', '"settings":               SettingsWorkflow,\n    "clinic-management":      ClinicManagementWorkflow,')

with open('app/v2/V2App.tsx', 'w', encoding='utf-8') as f:
    f.write(v2app)

print("Done fixing V2App.tsx")

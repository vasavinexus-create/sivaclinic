with open('app/v2/V2App.tsx', 'r', encoding='utf-8') as f:
    v2app = f.read()

v2app = v2app.replace('import { SettingsWorkflow, UsersRolesWorkflow, ClinicManagementWorkflow } from "./components/AdminWorkflows";', 'import { SettingsWorkflow, UsersRolesWorkflow } from "./components/AdminWorkflows";\\nimport { ClinicManagementWorkflow } from "./components/V1ClinicManagement";')
v2app = v2app.replace('import { ClinicManagementWorkflow } from "./components/AdminWorkflows";', 'import { ClinicManagementWorkflow } from "./components/V1ClinicManagement";')

with open('app/v2/V2App.tsx', 'w', encoding='utf-8') as f:
    f.write(v2app)

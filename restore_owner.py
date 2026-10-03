import os
import re

# 1. Update lib/page-permissions.ts
with open('lib/page-permissions.ts', 'r', encoding='utf-8') as f:
    perms = f.read()

if 'software_owner: allPageLabels' not in perms:
    perms = perms.replace('admin: allPageLabels,', 'admin: allPageLabels,\n  software_owner: allPageLabels,')
if '"Clinic Management"' not in perms:
    perms = perms.replace('"Dashboard",', '"Dashboard","Clinic Management",')

with open('lib/page-permissions.ts', 'w', encoding='utf-8') as f:
    f.write(perms)


# 2. Update app/v2/lib/modules.ts
with open('app/v2/lib/modules.ts', 'r', encoding='utf-8') as f:
    mods = f.read()

if 'Clinic Management' not in mods:
    mods = mods.replace('{ label: "Users & Roles"', '{ label: "Clinic Management", key: "clinic-management" },\n  { label: "Users & Roles"')
    with open('app/v2/lib/modules.ts', 'w', encoding='utf-8') as f:
        f.write(mods)


# 3. Update app/v2/components/AdminWorkflows.tsx
with open('app/v2/components/AdminWorkflows.tsx', 'r', encoding='utf-8') as f:
    admin = f.read()

clinic_wf = '''
export function ClinicManagementWorkflow({ notify }: { notify: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase.rpc("create_clinic_with_admin", {
      p_clinic_name: form.get("clinic_name"),
      p_admin_email: form.get("admin_email"),
      p_admin_name: form.get("admin_name"),
      p_phone: form.get("phone") || null
    });
    setSaving(false);
    if (error) { notify(error.message); return; }
    notify("Clinic created and admin login invite saved");
    event.currentTarget.reset();
  };
  return <FormPanel title="Clinic Management" subtitle="Software owner area for creating clinics and first admin logins" onSubmit={save}><div className="form-grid"><Field name="clinic_name" label="Hospital / clinic name" required/><Field name="phone" label="Phone"/><Field name="admin_name" label="Clinic admin name" required/><Field name="admin_email" label="Clinic admin email" type="email" required/></div><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Create clinic</button></div></FormPanel>;
}
'''

if 'ClinicManagementWorkflow' not in admin:
    admin = admin + '\n' + clinic_wf
    with open('app/v2/components/AdminWorkflows.tsx', 'w', encoding='utf-8') as f:
        f.write(admin)

# 4. Update app/v2/V2App.tsx
with open('app/v2/V2App.tsx', 'r', encoding='utf-8') as f:
    v2app = f.read()

if 'ClinicManagementWorkflow' not in v2app:
    v2app = re.sub(r'import\s+\{\s*SettingsWorkflow,\s*UsersRolesWorkflow\s*\}\s*from\s*"./components/AdminWorkflows";', 'import { SettingsWorkflow, UsersRolesWorkflow, ClinicManagementWorkflow } from "./components/AdminWorkflows";', v2app)
    
    if 'ClinicManagementWorkflow' not in v2app:
        v2app = v2app.replace('import { SettingsWorkflow, UsersRolesWorkflow } from "./components/AdminWorkflows";', 'import { SettingsWorkflow, UsersRolesWorkflow, ClinicManagementWorkflow } from "./components/AdminWorkflows";')

    if '"clinic-management": ClinicManagementWorkflow' not in v2app:
        v2app = v2app.replace('"users-roles": UsersRolesWorkflow,', '"users-roles": UsersRolesWorkflow,\n  "clinic-management": ClinicManagementWorkflow,')
        
    with open('app/v2/V2App.tsx', 'w', encoding='utf-8') as f:
        f.write(v2app)

print("Done")

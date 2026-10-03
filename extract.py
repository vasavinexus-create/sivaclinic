import codecs

with codecs.open('tmp_v1_page.tsx', 'r', 'utf-16le') as f:
    content = f.read()

content = content.replace('import { supabase } from "../lib/supabase";', 'import { supabase } from "../../../lib/supabase";')
content = content.replace('export default function App()', 'export default function OldApp()')
content = content.replace('function ClinicManagement({notify}', 'export function ClinicManagementWorkflow({notify}')

with codecs.open('app/v2/components/V1ClinicManagement.tsx', 'w', 'utf-8') as f:
    f.write(content)

print("Done")

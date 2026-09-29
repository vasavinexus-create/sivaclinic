# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    '{profile.organization_name || "CLINIC NAME"}',
    '{(profile as any).organization_name || "CLINIC NAME"}'
)
code = code.replace(
    '{profile.organization_name || "Our Clinic"}',
    '{(profile as any).organization_name || "Our Clinic"}'
)
code = code.replace(
    '{profile.organization_name || "Clinic Administration"}',
    '{(profile as any).organization_name || "Clinic Administration"}'
)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)
print("Fixed type error")

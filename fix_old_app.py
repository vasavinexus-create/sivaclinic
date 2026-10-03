import codecs

with codecs.open('app/v2/components/V1ClinicManagement.tsx', 'r', 'utf-8') as f:
    content = f.read()

content = content.replace('<ClinicManagement notify={notify}/>', '<ClinicManagementWorkflow notify={notify}/>')

with codecs.open('app/v2/components/V1ClinicManagement.tsx', 'w', 'utf-8') as f:
    f.write(content)

print("Fixed")

import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'patient_id: patientId || null,\n      medicine_subtotal: medicine,',
    'patient_id: patientId || null,\n      consultation_id: pending?.id || null,\n      medicine_subtotal: medicine,'
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done")

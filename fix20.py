import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    lines = f.readlines()

new_lines = []
inserted = False
for line in lines:
    new_lines.append(line)
    if 'const [saving, setSaving] = useState(false);' in line and not inserted:
        new_lines.append('  const [pending, setPending] = useState<Row | null>(null);\n\n')
        new_lines.append('  useEffect(() => {\n')
        new_lines.append('    if (!patientId || !supabase) { setPending(null); return; }\n')
        new_lines.append('    supabase.from("consultations").select("id,doctor_fee,visited_at").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).order("visited_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setPending(data));\n')
        new_lines.append('  }, [patientId]);\n')
        inserted = True

with codecs.open(path, 'w', 'utf-8') as f:
    f.writelines(new_lines)

print("Inserted state!")

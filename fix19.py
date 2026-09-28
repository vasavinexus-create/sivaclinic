import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_state = '''  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);'''

new_state = '''  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Row | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) { setPending(null); return; }
    supabase.from("consultations")
      .select("id,doctor_fee,visited_at")
      .eq("patient_id", patientId)
      .eq("doctor_fee_collected", false)
      .gt("doctor_fee", 0)
      .order("visited_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPending(data));
  }, [patientId]);'''

# only replace the first occurrence
code = code.replace(old_state, new_state, 1)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")

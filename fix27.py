import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. Update the useEffect to fetch all pending fees, not just one.
# Current:
# const [pending, setPending] = useState<Row | null>(null);
# supabase.from("consultations").select("id,doctor_fee,visited_at").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).order("visited_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setPending(data));
# We will change it to useState<Row[]>([]), and .then(({data}) => setPending(data || []))

old_use_effect = """  const [pending, setPending] = useState<Row | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) { setPending(null); return; }
    supabase.from("consultations").select("id,doctor_fee,visited_at").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).order("visited_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setPending(data));
  }, [patientId]);"""

new_use_effect = """  const [pending, setPending] = useState<Row[]>([]);

  useEffect(() => {
    if (!patientId || !supabase) { setPending([]); return; }
    supabase.from("consultations").select("id,doctor_fee,visited_at").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).order("visited_at", { ascending: false }).then(({ data }) => setPending(data || []));
  }, [patientId]);"""

code = code.replace(old_use_effect, new_use_effect)

# 2. Update fee calculation
# Old: const fee = Number(pending?.doctor_fee || 0);
# New: const fee = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);
code = code.replace('const fee = Number(pending?.doctor_fee || 0);', 'const fee = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);')

# 3. Update the RPC calls!
old_rpc = """    if (pending) {
      await supabase.rpc("collect_consultation_fee", {
        p_consultation_id: pending.id,
        p_sale_id: sale.id
      });
    }"""
new_rpc = """    for (const p of pending) {
      await supabase.rpc("collect_consultation_fee", {
        p_consultation_id: p.id,
        p_sale_id: sale.id
      });
    }"""
code = code.replace(old_rpc, new_rpc)

# 4. Update the reset block
code = code.replace('setPending(null);', 'setPending([]);')

# 5. Update the UI
old_ui_1 = '''{pending && <div className="fee-banner auth-message" style={{ marginBottom: "16px", background: "#fff5f5", color: "#c53030", padding: "12px", borderRadius: "8px", border: "1px solid #fed7d7" }}>Pending doctor fee will be collected once: <b>{money(pending.doctor_fee)}</b></div>}'''
new_ui_1 = '''{pending.length > 0 && <div className="fee-banner auth-message" style={{ marginBottom: "16px", background: "#fff5f5", color: "#c53030", padding: "12px", borderRadius: "8px", border: "1px solid #fed7d7" }}>Pending doctor fee ({pending.length}) will be collected: <b>{money(pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0))}</b></div>}'''
code = code.replace(old_ui_1, new_ui_1)

old_ui_2 = '''{pending && <span>Doctor fee <b>{money(pending.doctor_fee)}</b></span>}'''
new_ui_2 = '''{pending.length > 0 && <span>Doctor fee <b>{money(pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0))}</b></span>}'''
code = code.replace(old_ui_2, new_ui_2)

# Fix grand total in UI
old_ui_3 = '''<strong>Grand total <b>{money(total + Number(pending?.doctor_fee || 0))}</b></strong>'''
new_ui_3 = '''<strong>Grand total <b>{money(total + pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0))}</b></strong>'''
code = code.replace(old_ui_3, new_ui_3)

# Fix sale insert consultation_id
# We shouldn't set a single consultation_id if there are multiple. 
code = code.replace('consultation_id: pending?.id || null,', 'consultation_id: pending.length === 1 ? pending[0].id : null,')


with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done")

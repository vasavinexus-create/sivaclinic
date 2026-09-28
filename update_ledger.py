# -*- coding: utf-8 -*-
import codecs
import re

path = 'app/v2/components/InpatientLedgerWorkflow.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

new_effect = """
  useEffect(() => {
    if (!patientId || !supabase) { setEntries([]); return; }
    setLoading(true);
    
    Promise.all([
      supabase.from("patient_ledger")
        .select("*")
        .eq("patient_id", patientId)
        .order("occurred_on", { ascending: true }),
      supabase.from("consultations")
        .select("id,visited_at,doctor_fee,created_at")
        .eq("patient_id", patientId)
        .eq("doctor_fee_collected", false)
        .gt("doctor_fee", 0)
    ]).then(([ledgerRes, consRes]) => {
      const ledger = (ledgerRes.data as any[]) || [];
      const cons = (consRes.data || []).map(c => ({
        id: c.id,
        patient_id: patientId,
        occurred_on: c.visited_at,
        particulars: "Pending Doctor Fee",
        reference_type: "Consultation",
        reference_number: c.id,
        debit: c.doctor_fee,
        credit: 0,
        created_at: c.created_at,
        is_pending: true
      }));
      
      const combined = [...ledger, ...cons].sort((a, b) => new Date(a.occurred_on).getTime() - new Date(b.occurred_on).getTime());
      setEntries(combined as any[]);
      setLoading(false);
    });
  }, [patientId]);
"""

code = re.sub(r'useEffect\(\(\) => \{.*?\}, \[patientId\]\);', new_effect.strip(), code, flags=re.DOTALL)

code = code.replace('<td>{entry.particulars}</td>', '<td>{entry.particulars} {(entry as any).is_pending && <span style={{fontSize:"10px", color:"#c53030", marginLeft:"8px", padding:"2px 4px", background:"#fed7d7", borderRadius:"4px"}}>PENDING</span>}</td>')
code = code.replace('<tr key={entry.id}>', '<tr key={entry.id} style={(entry as any).is_pending ? {backgroundColor: "#fff5f5"} : {}}>')

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated InpatientLedgerWorkflow.tsx")

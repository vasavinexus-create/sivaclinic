# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

new_comp = """
export function InpatientLedgerWorkflow({ profile }: { profile: any }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("patient_ledger").select("id,occurred_on,particulars,reference_type,reference_number,debit,credit,created_at").eq("organization_id", profile.organization_id).order("occurred_on", { ascending: false }).limit(500),
      supabase.from("consultations").select("id,visited_at,doctor_fee,created_at").eq("organization_id", profile.organization_id).eq("doctor_fee_collected", false).gt("doctor_fee", 0).limit(500)
    ]).then(([ledgerRes, consRes]) => {
      const ledger = ledgerRes.data || [];
      const cons = (consRes.data || []).map(c => ({
        id: c.id,
        occurred_on: c.visited_at,
        particulars: "Pending Doctor Fee",
        reference_type: "Consultation",
        reference_number: c.id,
        debit: c.doctor_fee,
        credit: 0,
        created_at: c.created_at,
        is_pending: true
      }));
      
      const combined = [...ledger, ...cons].sort((a, b) => new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime());
      setData(combined);
      setLoading(false);
    });
  }, [profile.organization_id]);

  return (
    <div className="workflow-panel">
      <header className="workflow-header">
        <div>
          <h2>Inpatient Ledger</h2>
          <p>Patient ledger register (including pending doctor fees)</p>
        </div>
      </header>
      <div className="crud-table-wrap">
        <table className="crud-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Particulars</th>
              <th>Type</th>
              <th>Reference</th>
              <th style={{textAlign:'right'}}>Debit</th>
              <th style={{textAlign:'right'}}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{textAlign:'center'}}>Loading...</td></tr> : data.map(row => (
              <tr key={row.id} style={row.is_pending ? {backgroundColor: '#fff5f5'} : {}}>
                <td>{new Date(row.occurred_on).toLocaleDateString()}</td>
                <td>{row.particulars} {row.is_pending && <span style={{fontSize:'10px', color:'#c53030', marginLeft:'8px', padding:'2px 4px', background:'#fed7d7', borderRadius:'4px'}}>PENDING</span>}</td>
                <td>{row.reference_type}</td>
                <td><span style={{fontSize:'12px', color:'#718096'}}>{String(row.reference_number).substring(0,8)}</span></td>
                <td style={{textAlign:'right', color:'#c53030'}}>{row.debit > 0 ? Number(row.debit).toFixed(2) : '-'}</td>
                <td style={{textAlign:'right', color:'#276749'}}>{row.credit > 0 ? Number(row.credit).toFixed(2) : '-'}</td>
              </tr>
            ))}
            {!loading && data.length === 0 && <tr><td colSpan={6} style={{textAlign:'center'}}>No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
"""

if "InpatientLedgerWorkflow" not in code:
    code += new_comp
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(code)
    print("Added InpatientLedgerWorkflow")
else:
    print("Already exists")

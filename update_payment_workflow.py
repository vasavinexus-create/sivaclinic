# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PaymentWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

if 'useEffect' not in code:
    code = code.replace('import { FormEvent, useState } from "react";', 'import { FormEvent, useState, useEffect } from "react";')
if 'money' not in code:
    code = code.replace('import { postJournal } from "../lib/accounting";', 'import { postJournal } from "../lib/accounting";\nimport { money } from "../lib/format";')

state_hook = """  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [pendingFee, setPendingFee] = useState<number>(0);

  useEffect(() => {
    if (!patientId || !supabase) { setBalance(null); setPendingFee(0); return; }
    
    supabase.from("patient_ledger").select("debit,credit").eq("patient_id", patientId).then(({ data }) => {
      if (!data) { setBalance(null); return; }
      setBalance(data.reduce((sum: number, r: any) => sum + Number(r.debit || 0) - Number(r.credit || 0), 0));
    });
    
    supabase.from("consultations").select("doctor_fee").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).then(({ data }) => {
      setPendingFee((data || []).reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0));
    });
  }, [patientId]);"""

code = code.replace('  const [saving, setSaving] = useState(false);', state_hook)

banner_html = """<AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient" value={patientId} onChange={setPatientId} render={patientText}/>
      {patientId && balance !== null && <div className="auth-message" style={{ gridColumn: "1 / -1", background: "#f0fdf4", color: "#22543d", padding: "12px", borderRadius: "8px", border: "1px solid #c6f6d5" }}>
        <span>Current Patient Balance: <b style={{ color: balance + pendingFee > 0 ? "#c53030" : "#276749" }}>{money(balance + pendingFee)}</b> {balance + pendingFee > 0 ? "(Dr / Pending Payment)" : balance + pendingFee < 0 ? "(Cr / Excess Paid)" : ""}</span>
      </div>}"""

code = code.replace('<AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient" value={patientId} onChange={setPatientId} render={patientText}/>', banner_html)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated InpatientPaymentWorkflow")

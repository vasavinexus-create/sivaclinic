# -*- coding: utf-8 -*-
import codecs
import re

path = 'app/v2/components/InpatientLedgerWorkflow.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

printable_ledger = """
function PrintableLedger({ organization, patientName, patientId, mobile, entries, balance }: any) {
  return (
    <div className="print-only">
      <div className="print-header">
        <h1>{organization?.clinic_name || organization?.pharmacy_name || "CLINIC / PHARMACY"}</h1>
        <p>{organization?.address || "Address not provided"}</p>
        <p>Phone: {organization?.phone || "-"} | GST: {organization?.gst_number || "Unregistered"}</p>
      </div>

      <div className="print-details">
        <div className="patient-info">
          <strong>Patient Ledger Statement</strong><br />
          <strong>Name:</strong> {patientName || "Select a patient"}<br />
          <strong>ID:</strong> {patientId || "-"}<br />
          {mobile ? `Phone: ${mobile}` : ""}
        </div>
        <div className="invoice-info">
          <strong>Date Generated:</strong> {new Date().toLocaleString()}<br />
          <strong>Closing Balance:</strong> {balance > 0 ? `${balance.toFixed(2)} Dr` : balance < 0 ? `${Math.abs(balance).toFixed(2)} Cr` : "0.00"}
        </div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Particulars</th>
            <th>Ref</th>
            <th className="right">Debit</th>
            <th className="right">Credit</th>
            <th className="right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let runningBalance = 0;
            return entries.map((entry: any, i: number) => {
              runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
              return (
                <tr key={i}>
                  <td>{new Date(entry.occurred_on).toLocaleDateString()}</td>
                  <td>{entry.particulars} {entry.is_pending && "(PENDING)"}</td>
                  <td>{entry.reference_number || entry.reference_type || "-"}</td>
                  <td className="right">{Number(entry.debit || 0) > 0 ? Number(entry.debit).toFixed(2) : "-"}</td>
                  <td className="right">{Number(entry.credit || 0) > 0 ? Number(entry.credit).toFixed(2) : "-"}</td>
                  <td className="right"><strong>{Math.abs(runningBalance).toFixed(2)}</strong> {runningBalance > 0 ? "Dr" : runningBalance < 0 ? "Cr" : ""}</td>
                </tr>
              );
            });
          })()}
        </tbody>
      </table>
      
      <div className="print-footer">
        <p>This is a computer generated statement.</p>
      </div>
    </div>
  );
}
"""

if 'PrintableLedger' not in code:
    code = code.replace('export function InpatientLedgerWorkflow', printable_ledger + '\nexport function InpatientLedgerWorkflow')

if 'const [organization, setOrganization] = useState' not in code:
    code = code.replace('const [loading, setLoading] = useState(false);', 'const [loading, setLoading] = useState(false);\n  const [organization, setOrganization] = useState<any>(null);\n  const [patientData, setPatientData] = useState<any>(null);')
    
    org_fetch = """
  useEffect(() => {
    if (supabase) {
      supabase.from("organizations").select("*").eq("id", profile.organization_id).single().then(({data}) => setOrganization(data));
    }
  }, [profile.organization_id]);
"""
    code = code.replace('useEffect(() => {', org_fetch + '\n  useEffect(() => {', 1)

code = code.replace('onChange={setPatientId}', 'onChange={(id, row) => { setPatientId(id); setPatientData(row); }}')
code = code.replace('let balance = 0;', 'let printBalance = entries.reduce((s, e) => s + Number(e.debit || 0) - Number(e.credit || 0), 0);\n  let balance = 0;')

code = code.replace(
    'return (\n    <div>\n      <div className="page-head" style={{ display: \'flex\', justifyContent: \'space-between\', alignItems: \'flex-start\' }}>',
    'return (\n    <div>\n      <PrintableLedger organization={organization} patientName={patientData?.name} patientId={patientData?.patient_id} mobile={patientData?.mobile} entries={entries} balance={printBalance} />\n      <div className="no-print">\n      <div className="page-head" style={{ display: \'flex\', justifyContent: \'space-between\', alignItems: \'flex-start\' }}>'
)

code = code.replace('</div>\n  );\n}', '</div>\n      </div>\n  );\n}')

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated InpatientLedgerWorkflow.tsx with PrintableLedger")

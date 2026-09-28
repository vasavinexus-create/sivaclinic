# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

btn_html = '''</div>
    <div className="print-hide" style={{ display: 'flex', gap: '10px' }}>
      <button className="secondary" onClick={() => window.print()} style={{ minHeight: '38px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Print
      </button>
      <button className="secondary" onClick={() => { alert("In the print dialog, select 'Save as PDF' as your printer."); window.print(); }} style={{ minHeight: '38px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        PDF Export
      </button>
    </div>
  </div>'''

# 1. Billing Workflow
code = code.replace(
    'return <div><div className="page-head"><div><h1>Billing',
    'return <div><div className="page-head" style={{ display: \'flex\', justifyContent: \'space-between\', alignItems: \'flex-start\' }}><div><h1>Billing'
)
code = code.replace(
    'deduction.</p></div></div><div className="panel billing-panel">',
    f'deduction.</p>{btn_html}<div className="panel billing-panel">'
)

# 2. Inpatient Billing Workflow
code = code.replace(
    'return <div><div className="page-head"><div><h1>Inpatient Billing',
    'return <div><div className="page-head" style={{ display: \'flex\', justifyContent: \'space-between\', alignItems: \'flex-start\' }}><div><h1>Inpatient Billing'
)
code = code.replace(
    'ledger.</p></div></div><div className="panel billing-panel">',
    f'ledger.</p>{btn_html}<div className="panel billing-panel">'
)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated PharmacyWorkflows.tsx")

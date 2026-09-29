# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

new_print_layouts = """      {/* Print Layouts */}
      {module.key === 'low-stock' && (() => {
        const selectedSupplier = suppliers.find(s => s.id === orderSupplierName);
        return (
          <div className="print-only" style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#fff", color: "#000", minHeight: "100vh" }}>
            
            {/* Letterhead */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #126b5a', paddingBottom: 20, marginBottom: 30 }}>
              <div>
                 <h1 style={{ color: '#126b5a', margin: '0 0 5px 0', fontSize: '32px', fontWeight: 800 }}>{org?.clinic_name || (profile as any).organization_name || 'CLINIC NAME'}</h1>
                 {org?.pharmacy_name && <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#555' }}>{org.pharmacy_name}</h2>}
                 <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.5 }}>
                   {org?.address}<br/>
                   {org?.phone && <>Phone: {org.phone}<br/></>}
                   {org?.gst_number && <>GSTIN: {org.gst_number}</>}
                 </p>
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: 30 }}>
               <h2 style={{ margin: 0, fontSize: 24, letterSpacing: 2, textTransform: 'uppercase' }}>Purchase Order</h2>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 30 }}>
              <div style={{ flex: 1 }}>
                 <h4 style={{ margin: "0 0 8px 0", color: "#666", textTransform: 'uppercase', fontSize: 12 }}>To Supplier:</h4>
                 <div style={{ padding: 15, backgroundColor: "#f9f9f9", borderRadius: 4, minHeight: 100 }}>
                   {selectedSupplier ? <>
                     <strong style={{ fontSize: 16 }}>{selectedSupplier.name}</strong><br/>
                     <div style={{ marginTop: 8, fontSize: 14, color: '#444', lineHeight: 1.5 }}>
                       {selectedSupplier.address && <>{selectedSupplier.address}<br/></>}
                       {selectedSupplier.mobile && <>Phone: {selectedSupplier.mobile}<br/></>}
                       {selectedSupplier.gst_number && <>GSTIN: {selectedSupplier.gst_number}</>}
                     </div>
                   </> : <em style={{ color: '#999' }}>No supplier selected</em>}
                 </div>
              </div>
              <div style={{ flex: 1, marginLeft: 30 }}>
                 <h4 style={{ margin: "0 0 8px 0", color: "#666", textTransform: 'uppercase', fontSize: 12 }}>Order Details:</h4>
                 <div style={{ padding: 15, border: "1px solid #eee", borderRadius: 4, minHeight: 100, fontSize: 14, lineHeight: 1.8 }}>
                   <strong>PO Number:</strong> PO-{Date.now().toString().slice(-6)}<br/>
                   <strong>Date:</strong> {new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}<br/>
                   <strong>Status:</strong> New Order
                 </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
              <thead>
                 <tr>
                    <th style={{ backgroundColor: '#126b5a', color: '#fff', padding: 12, textAlign: 'left', border: '1px solid #126b5a' }}>S.No</th>
                    <th style={{ backgroundColor: '#126b5a', color: '#fff', padding: 12, textAlign: 'left', border: '1px solid #126b5a' }}>Description of Goods</th>
                    <th style={{ backgroundColor: '#126b5a', color: '#fff', padding: 12, textAlign: 'center', border: '1px solid #126b5a' }}>Order Qty</th>
                 </tr>
              </thead>
              <tbody>
                 {state.rows.filter(r => selected.has(r.id)).map((r, i) => (
                   <tr key={r.id}>
                     <td style={{ padding: 12, border: '1px solid #eee', borderBottom: '1px solid #ccc' }}>{i + 1}</td>
                     <td style={{ padding: 12, border: '1px solid #eee', borderBottom: '1px solid #ccc' }}>
                       <strong style={{ fontSize: 15 }}>{valueAt(r, "product.name")}</strong>
                       <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Current Stock: {valueAt(r, 'current_stock')} | Batch: {valueAt(r, 'batch_number')}</div>
                     </td>
                     <td style={{ padding: 12, border: '1px solid #eee', borderBottom: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{orderQuantities[r.id] || "0"}</td>
                   </tr>
                 ))}
              </tbody>
            </table>

            <div style={{ marginTop: 80, display: "flex", justifyContent: "space-between" }}>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ borderTop: '1px solid #000', width: 200, paddingTop: 10, fontWeight: 'bold' }}>Authorized Signatory</div>
                 <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>For {org?.clinic_name || (profile as any).organization_name}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ borderTop: '1px solid #000', width: 200, paddingTop: 10, fontWeight: 'bold' }}>Supplier Acceptance</div>
                 <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>Signature & Seal</div>
              </div>
            </div>
          </div>
        );
      })()}

      {module.key === 'expiry-alerts' && (() => {
        const selectedRows = state.rows.filter(r => selected.has(r.id));
        const bySupplier = new Map<string, Row[]>();
        selectedRows.forEach(r => {
          const sName = valueAt(r, "supplier.name") || "Unknown Supplier";
          bySupplier.set(sName, [...(bySupplier.get(sName) || []), r]);
        });
        
        return (
          <div className="print-only">
            {[...bySupplier.entries()].map(([supplierName, rows], index) => (
              <div key={supplierName} style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#fff", color: "#000", minHeight: "100vh", pageBreakAfter: index < bySupplier.size - 1 ? "always" : "auto" }}>
                
                {/* Letterhead */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #126b5a', paddingBottom: 20, marginBottom: 30 }}>
                  <div>
                     <h1 style={{ color: '#126b5a', margin: '0 0 5px 0', fontSize: '32px', fontWeight: 800 }}>{org?.clinic_name || (profile as any).organization_name || 'CLINIC NAME'}</h1>
                     {org?.pharmacy_name && <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#555' }}>{org.pharmacy_name}</h2>}
                     <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.5 }}>
                       {org?.address}<br/>
                       {org?.phone && <>Phone: {org.phone}<br/></>}
                       {org?.gst_number && <>GSTIN: {org.gst_number}</>}
                     </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                     <h2 style={{ margin: 0, fontSize: 20, color: '#333' }}>REPLACEMENT REQUEST</h2>
                     <p style={{ margin: "5px 0 0 0" }}>Date: <strong>{new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</strong></p>
                  </div>
                </div>
                
                <p style={{ marginBottom: "20px", fontSize: "15px", lineHeight: "1.5" }}>
                  To,<br/>
                  <strong>{supplierName}</strong><br/><br/>
                  Subject: Request for replacement of near-expiry/expired stock.<br/><br/>
                  Dear Sir/Madam,<br/>
                  Please arrange for the replacement or return of the following medicines which were supplied by you. These items are currently in our inventory and are nearing or have passed their expiry dates.
                </p>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 30, marginBottom: 40 }}>
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'left', border: '1px solid #ccc' }}>Medicine</th>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'left', border: '1px solid #ccc' }}>Batch No</th>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'left', border: '1px solid #ccc' }}>Expiry Date</th>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'center', border: '1px solid #ccc' }}>Return Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td style={{ padding: 12, border: '1px solid #ccc', fontWeight: 'bold' }}>{valueAt(r, "product.name")}</td>
                        <td style={{ padding: 12, border: '1px solid #ccc' }}>{valueAt(r, "batch_number")}</td>
                        <td style={{ padding: 12, border: '1px solid #ccc', color: '#d32f2f' }}>{fmtDate(valueAt(r, "expiry_date"))}</td>
                        <td style={{ padding: 12, border: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{valueAt(r, "current_stock")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div style={{ marginTop: 80 }}>
                  <p>Thank you,</p>
                  <div style={{ marginTop: 60, borderTop: '1px solid #000', width: 200, paddingTop: 10, fontWeight: 'bold' }}>Authorized Signatory</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>For {org?.clinic_name || (profile as any).organization_name}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
"""

idx1 = code.find('{/* Print Layouts */}')
idx2 = code.rfind('</div>;')
if idx2 == -1:
    idx2 = code.rfind('</div>')
    
if idx1 > -1 and idx2 > -1:
    final_code = code[:idx1] + new_print_layouts + "\n    </div>\n  );\n}\n"
    with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
        f.write(final_code)
    print("Injected via slicing successfully!")
else:
    print("Could not find markers")

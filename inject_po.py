# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

new_print_layouts = """    {/* Print Layouts */}
    {module.key === 'low-stock' && (() => {
      const selectedSupplier = suppliers.find(s => s.id === orderSupplierName);
      return (
        <div className="print-only" style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#fff", color: "#000", minHeight: "100vh" }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: "20px", marginBottom: "20px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "28px" }}>{profile.organization_name || "CLINIC NAME"}</h1>
              <p style={{ margin: "5px 0 0 0" }}>Purchase Order</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <h2 style={{ margin: 0, fontSize: "24px", color: "#555" }}>PURCHASE ORDER</h2>
              <p style={{ margin: "5px 0 0 0" }}>Date: <strong>{fmtDate(new Date().toISOString())}</strong></p>
            </div>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "30px" }}>
            <div>
              <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#666" }}>BILL TO:</h3>
              <strong>{profile.organization_name || "Our Clinic"}</strong>
            </div>
            <div style={{ textAlign: "right" }}>
               <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#666" }}>VENDOR / SUPPLIER:</h3>
               {selectedSupplier ? <>
                 <strong>{selectedSupplier.name}</strong><br/>
                 {selectedSupplier.address && <>{selectedSupplier.address}<br/></>}
                 {selectedSupplier.mobile && <>Phone: {selectedSupplier.mobile}<br/></>}
                 {selectedSupplier.email && <>Email: {selectedSupplier.email}<br/></>}
                 {selectedSupplier.gst_number && <>GST: {selectedSupplier.gst_number}<br/></>}
               </> : <em>No supplier selected</em>}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "40px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f4f4f4" }}>
                <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "left" }}>S.No</th>
                <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "left" }}>Medicine / Product Name</th>
                <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "center" }}>Order Quantity</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.filter(r => selected.has(r.id)).map((r, i) => (
                <tr key={r.id}>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{i + 1}</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>{valueAt(r, "product.name")}</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px", textAlign: "center", fontSize: "16px" }}>{orderQuantities[r.id] || "____"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
            <div>
              <hr style={{ width: "200px", borderTop: "1px solid #000" }}/>
              <p style={{ textAlign: "center", marginTop: "5px" }}>Authorized Signature</p>
            </div>
            <div>
              <hr style={{ width: "200px", borderTop: "1px solid #000" }}/>
              <p style={{ textAlign: "center", marginTop: "5px" }}>Supplier Acceptance</p>
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
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: "20px", marginBottom: "30px" }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: "24px" }}>EXPIRY REPLACEMENT REQUEST</h1>
                  <p style={{ margin: "5px 0 0 0" }}>To: <strong>{supplierName}</strong></p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>Date:</strong> {fmtDate(new Date().toISOString())}
                </div>
              </div>
              
              <p style={{ marginBottom: "20px", fontSize: "15px", lineHeight: "1.5" }}>
                Dear <strong>{supplierName}</strong>,<br/><br/>
                Please arrange for the replacement or return of the following medicines which were supplied by you. These items are currently in our inventory and are nearing or have passed their expiry dates. Ensure that the replacement stock is provided with sufficient shelf life.
              </p>
              
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "40px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f4f4f4" }}>
                    <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "left" }}>Medicine</th>
                    <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "left" }}>Batch No</th>
                    <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "left" }}>Expiry Date</th>
                    <th style={{ border: "1px solid #ccc", padding: "10px", textAlign: "center" }}>Return Qty (Stock)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>{valueAt(r, "product.name")}</td>
                      <td style={{ border: "1px solid #ccc", padding: "10px" }}>{valueAt(r, "batch_number")}</td>
                      <td style={{ border: "1px solid #ccc", padding: "10px", color: "#d32f2f" }}>{fmtDate(valueAt(r, "expiry_date"))}</td>
                      <td style={{ border: "1px solid #ccc", padding: "10px", textAlign: "center", fontSize: "16px" }}>{valueAt(r, "current_stock")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <div style={{ marginTop: "60px" }}>
                <p>Thank you,</p>
                <p><strong>{profile.organization_name || "Clinic Administration"}</strong></p>
              </div>
            </div>
          ))}
        </div>
      );
    })()}
"""

idx1 = code.find('{/* Print Layouts */}')
idx2 = code.rfind('</div>;')

if idx1 > -1 and idx2 > -1:
    final_code = code[:idx1] + new_print_layouts + "\n  " + code[idx2:]
    with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
        f.write(final_code)
    print("Successfully injected!")
else:
    print("Could not find boundaries")

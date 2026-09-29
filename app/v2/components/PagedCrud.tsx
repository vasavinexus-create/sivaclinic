"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money, nextCode } from "../lib/format";
import { pageSizeOptions } from "../lib/modules";
import { usePagedQuery } from "../lib/usePagedQuery";
import { FieldConfig, ModuleConfig, Profile, Row } from "../lib/types";

function isMoneyColumn(key: string) {
  return key.includes("fee") || key.includes("rate") || key.includes("amount") || key.includes("balance") || key === "mrp";
}

function valueAt(row: Row, key: string) {
  return key.split(".").reduce((value: any, part) => value?.[part], row);
}

function renderCell(row: Row, key: string, moduleKey?: string) {
  if (key === "current_stock" && (moduleKey === "low-stock" || moduleKey === "expiry-alerts")) {
    const val = valueAt(row, key) || 0;
    const conv = row.product?.default_units_per_purchase_unit || 1;
    const packs = Math.floor(val / conv);
    const rem = val % conv;
    const unit = row.product?.purchase_unit || "Pack";
    return rem > 0 ? `${packs} ${unit} + ${rem}` : `${packs} ${unit}`;
  }
  const value = valueAt(row, key);
  if (key.includes("date") || key.includes("_at")) return fmtDate(value);
  if (isMoneyColumn(key)) return money(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "-");
}

function formValue(field: FieldConfig, form: FormData) {
  const raw = form.get(field.key);
  if (field.type === "number") return raw !== null && String(raw) !== "" ? Number(raw) : 0;
  return raw ? String(raw) : null;
}

export default function PagedCrud({ module, profile, notify }: { module: ModuleConfig; profile: Profile; notify: (message: string) => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [orderSupplierName, setOrderSupplierName] = useState("");
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [isPrintingCustom, setIsPrintingCustom] = useState(false);
  const editable = module.editable !== false && module.fields.length > 0;
  const state = usePagedQuery({ module, page, pageSize, search, filters, organizationId: profile.organization_id });

  useEffect(() => {
    if (module.key === 'low-stock') {
      supabase?.from('suppliers').select('id,name,address,email,mobile,gst_number,supplier_id').eq('organization_id', profile.organization_id!).order('name').then(({data}) => {
         if (data) setSuppliers(data);
      });
      supabase?.from('organizations').select('*').eq('id', profile.organization_id!).single().then(({data}) => {
         if (data) setOrg(data);
      });
    }
  }, [module.key, profile.organization_id]);
  const pageCount = Math.max(1, Math.ceil(state.count / pageSize));

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setSearchInput("");
    setSearch("");
    setFilters({});
    setOpen(false);
    setEditing(null);
    setShowOrderModal(false);
    setShowLetterModal(false);
  }, [module.key]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const rangeLabel = useMemo(() => {
    if (!state.count) return "0 records";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, state.count);
    return `${start}-${end} of ${state.count}`;
  }, [page, pageSize, state.count]);

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, any> = {};
    module.fields.forEach((field) => {
      if (field.readonlyOnCreate && !editing) return;
      payload[field.key] = formValue(field, form);
    });
    if (!editing && module.idPrefix) {
      const idField = module.fields.find((field) => field.key.endsWith("_id"))?.key;
      if (idField) payload[idField] = nextCode(module.idPrefix);
    }
    
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      const res = await fetch("/api/v2/crud", {
        method: editing ? "PUT" : "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          table: module.table,
          id: editing?.id,
          payload
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Save failed");

      notify(`${module.title} ${editing ? "updated" : "saved"}`);
      close();
      state.reload();
    } catch (e: any) {
      notify(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return <div>
    <div className={`page-head ${isPrintingCustom ? "print-hide" : ""}`}>
      <div><h1>{module.title}</h1><p>{module.subtitle}</p></div>
      {editable && <button className="primary" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={17}/> Add {module.title}</button>}
    </div>
    <div className={`panel ${isPrintingCustom ? "print-hide" : ""}`}>
      <div className="v2-toolbar">
        <div className="search-box"><Search/><input placeholder={`Search ${module.title.toLowerCase()} in database`} value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)}/></div>
        {module.filters?.map((filter) => <label className="v2-filter" key={filter.key}><span>{filter.label}</span><select value={filters[filter.key] || ""} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, [filter.key]: event.currentTarget.value })); }}><option value="">All</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
        <label className="v2-filter"><span>Rows</span><select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.currentTarget.value)); }}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <button className="secondary" onClick={state.reload}><RefreshCw size={15}/> Refresh</button>
        {module.selectable && selected.size > 0 && (
          module.key === 'low-stock' ? (
            <button className="secondary primary-text" onClick={() => setShowOrderModal(true)}>Generate Purchase Order ({selected.size})</button>
          ) : module.key === 'expiry-alerts' ? (
            <button className="secondary primary-text" onClick={() => setShowLetterModal(true)}>Generate Replacement Letter ({selected.size})</button>
          ) : (
            <button className="secondary primary-text" onClick={() => window.print()}>Print / Save PDF ({selected.size} selected)</button>
          )
        )}
      </div>
      {state.error ? <div className="error-box">{state.error}</div> : state.loading ? <div className="loading-panel"><LoaderCircle className="spin"/> Loading from database...</div> : state.rows.length ? <>
        <div className="data-wrap"><table className="data-table"><thead><tr>
{module.selectable && <th className="no-print" style={{width: 40}}><input type="checkbox" checked={selected.size === state.rows.length && state.rows.length > 0} onChange={e => {
  if (e.target.checked) {
    setSelected(new Set(state.rows.map(r => r.id)));
  } else {
    setSelected(new Set());
  }
}} /></th>}
{module.columns.map(([key, label]) => <th key={key}>{label}</th>)}{editable && <th className="no-print">Action</th>}</tr></thead><tbody>{state.rows.map((row) => <tr key={row.id} className={module.selectable && selected.size > 0 && !selected.has(row.id) ? "no-print" : ""}>
{module.selectable && <td className="no-print"><input type="checkbox" checked={selected.has(row.id)} onChange={e => {
  const next = new Set(selected);
  if (e.target.checked) next.add(row.id);
  else next.delete(row.id);
  setSelected(next);
}} /></td>}
{module.columns.map(([key]) => <td key={key}>{renderCell(row, key, module.key)}</td>)}
{editable && <td className="no-print"><button className="table-edit" onClick={() => { setEditing(row); setOpen(true); }}><Pencil size={14}/> Edit</button></td>}
</tr>)}</tbody></table></div>
        <div className="pagination-bar"><span>{rangeLabel}</span><div><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button><span>Page {page} / {pageCount}</span><button className="secondary" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
      </> : <div className="empty"><h3>No matching records found.</h3><p>Try another search or clear filters.</p></div>}
    </div>
    {editable && open && <div className="modal-wrap"><div className="modal"><div className="modal-head"><div><h2>{editing ? "Edit" : "Add"} {module.title}</h2><p>{editing ? "Update only this record" : "New record uses generated code where required"}</p></div><button className="icon-btn" onClick={close}><X size={18}/></button></div><form onSubmit={save}><div className="form-grid">{module.fields.map((field) => {
      const value = editing?.[field.key] ?? field.defaultValue ?? "";
      if (field.readonlyOnCreate && !editing) return <label className="field" key={field.key}><span>{field.label}</span><input value="Auto generated" readOnly/></label>;
      if (field.type === "select") return <label className="field" key={field.key}><span>{field.label}{field.required && <b> *</b>}</span><select name={field.key} required={field.required} defaultValue={value}>{!field.required && <option value="">Select {field.label}</option>}{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
      return <label className="field" key={field.key}><span>{field.label}{field.required && <b> *</b>}</span><input name={field.key} type={field.type || "text"} required={field.required} defaultValue={value} step={field.type === "number" ? "0.01" : undefined}/></label>;
    })}</div><div className="form-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} {editing ? "Update" : "Save"}</button></div></form></div></div>}
    {showOrderModal && (
      <div className="modal-wrap print-hide">
        <div className="modal" style={{ maxWidth: 800 }}>
          <div className="modal-head">
            <div><h2>Generate Purchase Order</h2><p>Print a purchase order for selected low-stock items.</p></div>
            <button className="icon-btn" onClick={() => setShowOrderModal(false)}><X size={18}/></button>
          </div>
          <div className="form-grid" style={{ marginBottom: 20 }}>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Supplier Name</span>
              <select value={orderSupplierName} onChange={e => setOrderSupplierName(e.target.value)}>
                  <option value="">Select a supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} {s.supplier_id ? `(${s.supplier_id})` : ''}</option>)}
                </select>
            </label>
          </div>
          <div className="data-wrap" style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20 }}>
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Current Stock</th><th>Order Quantity</th></tr></thead>
              <tbody>
                {state.rows.filter(r => selected.has(r.id)).map(r => (
                  <tr key={r.id}>
                    <td>{valueAt(r, "product.name")}</td>
                    <td>{valueAt(r, "batch_number")}</td>
                    <td>{(() => {
  const v = valueAt(r, "current_stock") || 0;
  const c = r.product?.default_units_per_purchase_unit || 1;
  const p = Math.floor(v / c);
  const m = v % c;
  const u = r.product?.purchase_unit || "Pack";
  return m > 0 ? `${p} ${u} + ${m}` : `${p} ${u}`;
})()}</td>
                    <td>
                      <input type="number" min="1" value={orderQuantities[r.id] || ""} onChange={e => setOrderQuantities({...orderQuantities, [r.id]: parseInt(e.target.value) || 0})} style={{ width: 100, padding: 4 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setShowOrderModal(false)}>Cancel</button>
            <button className="primary" onClick={() => { setIsPrintingCustom(true); setTimeout(() => { window.print(); setTimeout(() => { setIsPrintingCustom(false); setShowOrderModal(false); }, 500); }, 500); }}>Print Order</button>
          </div>
        </div>
      </div>
    )}

    {showLetterModal && (
      <div className="modal-wrap print-hide">
        <div className="modal">
          <div className="modal-head">
            <div><h2>Generate Replacement Letter</h2><p>Print a request to replace expiring medicines.</p></div>
            <button className="icon-btn" onClick={() => setShowLetterModal(false)}><X size={18}/></button>
          </div>
          <div className="form-actions" style={{ marginTop: 20 }}>
            <button type="button" className="secondary" onClick={() => setShowLetterModal(false)}>Cancel</button>
            <button className="primary" onClick={() => { setIsPrintingCustom(true); setTimeout(() => { window.print(); setTimeout(() => { setIsPrintingCustom(false); setShowLetterModal(false); }, 500); }, 500); }}>Print Letter</button>
          </div>
        </div>
      </div>
    )}

              {/* Print Layouts */}
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
                       <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Unit: {r.product?.purchase_unit || 'Pack'}</div>
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
                        <td style={{ padding: 12, border: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{(() => {
  const v = valueAt(r, 'current_stock') || 0;
  const c = r.product?.default_units_per_purchase_unit || 1;
  const p = Math.floor(v / c);
  const m = v % c;
  const u = r.product?.purchase_unit || 'Pack';
  return m > 0 ? `${p} ${u} + ${m}` : `${p} ${u}`;
})()}</td>
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

    </div>
;
}

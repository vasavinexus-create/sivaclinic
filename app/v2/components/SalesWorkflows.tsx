"use client";

import { useEffect, useState } from "react";
import { Eye, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { canDeleteBill, cancelBill } from "../../../lib/bill-cancellation";
import { getEffectiveStock, insertStockMovementSafe, updateBatchStock } from "../../../lib/inventory-stock";
import { postJournal } from "../lib/accounting";
import { Organization, Profile, Row } from "../lib/types";
import { PrintableInvoice } from "./PharmacyWorkflows";

export function SalesWorkflow({ profile, organization, notify }: { profile: Profile; organization?: Organization | null; notify: (message: string) => void }) {
  const [tab, setTab] = useState<"completed" | "cancelled">("completed");
  const [fromInput, setFromInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [toInput, setToInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewSale, setViewSale] = useState<Row | null>(null);
  const [returnSale, setReturnSale] = useState<Row | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returning, setReturning] = useState(false);

  const load = () => {
    if (!supabase) return;
    setLoading(true);
    supabase
      .from("sales")
      .select("id,invoice_no,sold_at,grand_total,medicine_subtotal,medicine_tax,special_discount_amount,pharmacy_revenue,doctor_fee,payment_mode,status,sale_type,patient_id,patient:patients(patient_id,name,mobile),sale_items(id,product_id,batch_id,quantity,returned_quantity,unit_rate,gst_percent,line_total,product:products(name),batch:medicine_batches(batch_number,current_stock,stock_unit_qty))")
      .eq("organization_id", profile.organization_id)
      .eq("status", tab)
      .gte("sold_at", fromDate + "T00:00:00")
      .lte("sold_at", toDate + "T23:59:59")
      .order("sold_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setRows(data || []);
        setLoading(false);
      });
  };
  useEffect(load, [tab, fromDate, toDate, profile.organization_id]);

  const cancelSale = async (sale: Row) => {
    if (!canDeleteBill(profile.role, sale.sold_at, sale.status)) { notify("Only admin can delete bills from another day"); return; }
    const reason = window.prompt(`Reason for deleting ${sale.invoice_no}`);
    if (reason === null) return;
    try {
      await cancelBill("sale", sale.id, reason);
      notify(`${sale.invoice_no} cancelled; stock and accounts corrected. Pending admin audit.`);
      load();
    } catch (error) { notify(error instanceof Error ? error.message : "Bill cancellation failed"); }
  };

  const openReturnModal = (sale: Row) => {
    setReturnSale(sale);
    const initial: Record<string, number> = {};
    for (const item of sale.sale_items || []) {
      initial[item.id] = 0;
    }
    setReturnQtys(initial);
  };

  const submitReturn = async () => {
    if (!supabase || !returnSale) return;
    const itemsToReturn = (returnSale.sale_items || []).filter((item: Row) => {
      const qty = Number(returnQtys[item.id] || 0);
      const maxReturnable = Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0));
      return qty > 0 && qty <= maxReturnable;
    });
    if (!itemsToReturn.length) {
      notify("Enter a valid return quantity for at least one medicine.");
      return;
    }

    setReturning(true);
    try {
      let refundTotal = 0;
      let refundTax = 0;
      for (const item of itemsToReturn) {
        const retQty = Number(returnQtys[item.id] || 0);
        const unitRate = Number(item.unit_rate || 0);
        const gstPercent = Number(item.gst_percent || 0);
        const lineRefund = Number((unitRate * retQty).toFixed(2));
        const baseRefund = gstPercent > 0 ? Number((lineRefund / (1 + gstPercent / 100)).toFixed(2)) : lineRefund;
        const lineTax = Number((lineRefund - baseRefund).toFixed(2));
        refundTotal += lineRefund;
        refundTax += lineTax;

        const newReturnedQty = Number(item.returned_quantity || 0) + retQty;
        await supabase.from("sale_items").update({ returned_quantity: newReturnedQty }).eq("id", item.id);

        if (item.batch_id) {
          const { data: freshBatch } = await supabase
            .from("medicine_batches")
            .select("id,current_stock,stock_unit_qty")
            .eq("id", item.batch_id)
            .maybeSingle();
          const currentStock = getEffectiveStock(freshBatch || item.batch);
          const newStock = currentStock + retQty;
          await updateBatchStock(supabase, item.batch_id, newStock);

          await insertStockMovementSafe(supabase, {
            organization_id: profile.organization_id,
            product_id: item.product_id,
            batch_id: item.batch_id,
            movement_type: "sale_return",
            reference_type: "sale_return",
            reference_id: returnSale.id,
            reference_number: returnSale.invoice_no,
            in_quantity: retQty,
            balance_quantity: newStock,
            notes: `Partial/full sale return for ${returnSale.invoice_no}`,
            created_by: profile.id,
          });
        }
      }

      refundTotal = Number(refundTotal.toFixed(2));
      refundTax = Number(refundTax.toFixed(2));
      const refundRevenue = Math.max(0, Number((refundTotal - refundTax).toFixed(2)));
      const effectiveRefundTax = Math.max(0, Number((refundTotal - refundRevenue).toFixed(2)));
      const newGrandTotal = Math.max(0, Number((Number(returnSale.grand_total || 0) - refundTotal).toFixed(2)));
      const newPharmacyRevenue = Math.max(0, Number((Number(returnSale.pharmacy_revenue || 0) - refundTotal).toFixed(2)));
      const newMedicineTax = Math.max(0, Number((Number(returnSale.medicine_tax || 0) - effectiveRefundTax).toFixed(2)));

      await supabase
        .from("sales")
        .update({
          grand_total: newGrandTotal,
          pharmacy_revenue: newPharmacyRevenue,
          medicine_tax: newMedicineTax,
        })
        .eq("id", returnSale.id);

      const isInpatient = returnSale.sale_type === "inpatient" || returnSale.payment_mode === "credit";
      const creditLedger = isInpatient
        ? "Patient Receivable"
        : String(returnSale.payment_mode || "cash").toLowerCase() === "cash"
        ? "Cash"
        : "Bank";

      if (isInpatient && returnSale.patient_id) {
        await supabase.from("patient_ledger").insert({
          organization_id: profile.organization_id,
          patient_id: returnSale.patient_id,
          occurred_on: new Date().toISOString().slice(0, 10),
          particulars: `Sale return credit for ${returnSale.invoice_no}`,
          reference_type: "sale_return",
          reference_id: returnSale.id,
          reference_number: returnSale.invoice_no,
          debit: 0,
          credit: refundTotal,
          created_by: profile.id,
        });
      } else {
        await supabase.from("cash_ledger").insert({
          organization_id: profile.organization_id,
          occurred_at: new Date().toISOString(),
          entry_type: "payment",
          category: `Sale return ${returnSale.invoice_no}`,
          amount: refundTotal,
          payment_mode: returnSale.payment_mode || "cash",
          reference_type: "sale",
          reference_id: returnSale.id,
          created_by: profile.id,
        });
      }

      try {
        const journalLines: Array<{ ledger: string; debit?: number; credit?: number }> = [
          { ledger: "Pharmacy Sales", debit: refundRevenue },
          { ledger: creditLedger, credit: refundTotal },
        ];
        if (effectiveRefundTax > 0) journalLines.push({ ledger: "GST Payable", debit: effectiveRefundTax });
        await postJournal(profile, {
          voucherType: "sale_return",
          entryDate: new Date().toISOString(),
          referenceType: "sale",
          referenceId: returnSale.id,
          referenceNumber: returnSale.invoice_no,
          narration: `Medicine return on ${returnSale.invoice_no}`,
          lines: journalLines,
        });
      } catch {}

      notify(`Returned items worth ${money(refundTotal)} on ${returnSale.invoice_no}; stock & accounts updated.`);
      setReturnSale(null);
      load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Sale return failed");
    } finally {
      setReturning(false);
    }
  };

  const activePrintCart = viewSale
    ? (viewSale.sale_items || []).map((item: Row) => ({
        name: item.product?.name || "Medicine",
        batch_number: item.batch?.batch_number || "-",
        qty: Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0)),
        selling_rate: Number(item.unit_rate || 0),
        gst_percent: Number(item.gst_percent || 0),
      }))
    : [];

  return (
    <div className="sales-page">
      {viewSale && (
        <PrintableInvoice
          organization={organization || null}
          patientName={viewSale.patient?.name || "Walk-in"}
          patientId={viewSale.patient?.patient_id || ""}
          mobile={viewSale.patient?.mobile || ""}
          invoiceNo={viewSale.invoice_no}
          date={viewSale.sold_at}
          cart={activePrintCart}
          medicine={Number(viewSale.medicine_subtotal || viewSale.pharmacy_revenue || 0)}
          tax={Number(viewSale.medicine_tax || 0)}
          specialDiscountAmount={Number(viewSale.special_discount_amount || 0)}
          total={Math.max(0, Number(viewSale.grand_total || 0) - Number(viewSale.doctor_fee || 0))}
          pendingFee={Number(viewSale.doctor_fee || 0)}
          title={viewSale.sale_type === "inpatient" ? "INPATIENT BILLING" : "PHARMACY BILL"}
        />
      )}
      <div className="no-print">
        <div className="page-head"><div><h1>Sales</h1><p>Sales register with invoice reprint, partial returns, and cancellation audit.</p></div></div>
        <div className="panel">
          <div className="sales-tools">
            <div className="tab-row sales-tabs">
              <button className={tab==="completed"?"active":""} onClick={()=>setTab("completed")}>Completed</button>
              <button className={tab==="cancelled"?"active":""} onClick={()=>setTab("cancelled")}>Cancelled</button>
            </div>
            <form className="sales-date-form" onSubmit={(e) => { e.preventDefault(); setFromDate(fromInput); setToDate(toInput); }}>
              <div className="sales-date-headings"><span>From</span><span>To</span></div>
              <div className="sales-date-inputs"><input aria-label="From date" type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} required /><input aria-label="To date" type="date" value={toInput} min={fromInput} onChange={(e) => setToInput(e.target.value)} required /></div>
              <button type="submit" className="primary">Load</button>
            </form>
          </div>
          {loading ? <div className="loading-panel">Loading sales...</div> : rows.length ? (
            <div className="data-wrap">
              <table className="data-table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Type</th><th>Mode</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {rows.map((sale) => (
                    <tr key={sale.id}>
                      <td data-label="Invoice"><strong>{sale.invoice_no}</strong></td>
                      <td data-label="Date">{fmtDate(sale.sold_at)}</td>
                      <td data-label="Patient">{sale.patient?.name || "Walk-in"}</td>
                      <td data-label="Type">{sale.sale_type || "outpatient"}</td>
                      <td data-label="Mode" style={{ textTransform: "uppercase", fontSize: "12px" }}>{sale.payment_mode || "cash"}</td>
                      <td data-label="Total"><strong>{money(sale.grand_total)}</strong></td>
                      <td data-label="Status">{sale.status}</td>
                      <td data-label="Action">
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button type="button" className="table-edit" onClick={() => setViewSale(sale)}><Eye size={14}/> View / Print</button>
                          {tab === "completed" && <button type="button" className="table-edit" onClick={() => openReturnModal(sale)}><RotateCcw size={14}/> Return</button>}
                          {tab === "completed" && canDeleteBill(profile.role, sale.sold_at, sale.status) && (
                            <button type="button" className="table-edit danger-btn" onClick={() => cancelSale(sale)}><Trash2 size={14}/> Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty"><h3>{tab === "completed" ? "No completed sales found." : "No cancelled sales found."}</h3><p>For the selected date.</p></div>
          )}
        </div>

        {viewSale && (
          <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div className="panel" style={{ width: "100%", maxWidth: "680px", background: "#fff", borderRadius: "12px", padding: "20px", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Invoice {viewSale.invoice_no}</h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>{fmtDate(viewSale.sold_at)} · {viewSale.patient?.name || "Walk-in"} · Mode: {String(viewSale.payment_mode || "cash").toUpperCase()}</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" className="primary" onClick={() => window.print()}><Printer size={15}/> Print Invoice</button>
                  <button type="button" className="table-edit" onClick={() => setViewSale(null)}><X size={16}/></button>
                </div>
              </div>
              <div className="data-wrap">
                <table className="data-table">
                  <thead><tr><th>Medicine</th><th>Batch</th><th>Sold Qty</th><th>Returned</th><th>Rate</th><th>Total</th></tr></thead>
                  <tbody>
                    {(viewSale.sale_items || []).map((item: Row) => (
                      <tr key={item.id}>
                        <td>{item.product?.name || "-"}</td>
                        <td>{item.batch?.batch_number || "-"}</td>
                        <td>{item.quantity}</td>
                        <td>{item.returned_quantity || 0}</td>
                        <td>{money(item.unit_rate)}</td>
                        <td>{money(Number(item.unit_rate || 0) * Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "18px", marginTop: "14px", fontSize: "14px" }}>
                {Number(viewSale.doctor_fee || 0) > 0 && <span>Doctor Fee: <b>{money(viewSale.doctor_fee)}</b></span>}
                <span>Grand Total: <strong>{money(viewSale.grand_total)}</strong></span>
              </div>
            </div>
          </div>
        )}

        {returnSale && (
          <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div className="panel" style={{ width: "100%", maxWidth: "680px", background: "#fff", borderRadius: "12px", padding: "20px", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Return Medicines — {returnSale.invoice_no}</h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Enter quantity to return to stock and refund to customer/ledger.</p>
                </div>
                <button type="button" className="table-edit" onClick={() => setReturnSale(null)}><X size={16}/></button>
              </div>
              <div className="data-wrap">
                <table className="data-table">
                  <thead><tr><th>Medicine</th><th>Batch</th><th>Sold</th><th>Prev. Returned</th><th>Rate</th><th>Return Qty</th></tr></thead>
                  <tbody>
                    {(returnSale.sale_items || []).map((item: Row) => {
                      const maxReturn = Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0));
                      return (
                        <tr key={item.id}>
                          <td>{item.product?.name || "-"}</td>
                          <td>{item.batch?.batch_number || "-"}</td>
                          <td>{item.quantity}</td>
                          <td>{item.returned_quantity || 0}</td>
                          <td>{money(item.unit_rate)}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={maxReturn}
                              step="1"
                              disabled={maxReturn === 0}
                              value={returnQtys[item.id] ?? 0}
                              onChange={(e) => setReturnQtys((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(maxReturn, Number(e.target.value || 0))) }))}
                              style={{ width: "80px" }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button type="button" className="secondary" onClick={() => setReturnSale(null)}>Cancel</button>
                <button type="button" className="primary" onClick={submitReturn} disabled={returning}>
                  {returning ? "Processing..." : "Confirm Sale Return"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


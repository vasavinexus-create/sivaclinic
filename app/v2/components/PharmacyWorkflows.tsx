"use client";

import { Capacitor } from "@capacitor/core";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Trash2, RefreshCw, X, AlertCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { applyBillDiscountRule, deductSaleItemStock, fetchBillingRatePreview, resolveBillingBatchesForProduct } from "../../../lib/inventory-stock";
import { money } from "../lib/format";
import { postJournal } from "../lib/accounting";
import { getBillingPrintConfig, Organization, Profile, Row } from "../lib/types";
import { AsyncSelect, Field, QuickPatientModal } from "./controls";
import { SalesWorkflow as SalesRegisterWorkflow } from "./SalesWorkflows";
import { triggerUniversalPrint } from "../lib/print";

function productText(row: Row) {
  return `${row.name || ""}`;
}

function patientText(row: Row) {
  return `${row.patient_id || ""} - ${row.name || ""}${row.mobile ? ` - ${row.mobile}` : ""}`;
}

const todayInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const roundedSaleRate = (mrp: any, retailCount: any) => {
  const units = Number(retailCount || 1) || 1;
  const rate = Number(mrp || 0) / units;
  return rate > 0 ? Math.ceil(rate) : 0;
};
const discountedSaleRate = (mrp: any, retailCount: any, discountPercent: any) => {
  const rate = roundedSaleRate(mrp, retailCount);
  const discount = rate * (Number(discountPercent || 0) / 100);
  return Math.max(0, Number((rate - discount).toFixed(2)));
};


// --- Added Printable Invoice Component ---
export function PrintableInvoice({ 
  organization, 
  patientName, 
  patientId, 
  mobile, 
  invoiceNo, 
  date, 
  cart, 
  medicine, 
  tax, 
  specialDiscountAmount, 
  total,
  pendingFee,
  title,
  pageBreakBefore,
  pageBreakAfter,
}: any) {
  return (
    <div
      className={`print-only print-sheet${pageBreakBefore ? " print-sheet-break-before" : ""}${pageBreakAfter ? " print-sheet-break-after" : ""}`}
      style={{
        ...(pageBreakBefore ? { pageBreakBefore: "always", breakBefore: "page" } : {}),
        ...(pageBreakAfter ? { pageBreakAfter: "always", breakAfter: "page" } : {}),
      }}
    >
      <div className="print-header">
        <h1>{organization?.clinic_name || organization?.pharmacy_name || "CLINIC / PHARMACY"}</h1>
        <p>{organization?.address || "Address not provided"}</p>
        <p>Phone: {organization?.phone || "-"} | GST: {organization?.gst_number || "Unregistered"}</p>
      </div>

      <div className="print-details">
        <div className="patient-info">
          <strong>Bill To:</strong><br />
          {patientName || "Walk-in Patient"}<br />
          {patientId ? `ID: ${patientId}` : ""}<br />
          {mobile ? `Phone: ${mobile}` : ""}
        </div>
        <div className="invoice-info">
          <h2>{title || "TAX INVOICE"}</h2>
          <strong>Invoice No:</strong> {invoiceNo || "Draft"}<br />
          <strong>Date:</strong> {date ? new Date(date).toLocaleString() : new Date().toLocaleString()}
        </div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Item / Medicine</th>
            <th>Batch</th>
            <th className="right">Qty</th>
            <th className="right">MRP</th>
            <th className="right">Discount</th>
            <th className="right">Rate</th>
            <th className="right">GST</th>
            <th className="right">Total</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item: any, i: number) => {
            const mrpRate = Number(item.mrp_unit_rate || item.mrp || item.original_selling_rate || item.selling_rate || 0);
            const discountPercent = Number(item.sales_discount_percent ?? item.original_sales_discount_percent ?? 0);
            const sellingRate = Number(item.selling_rate || 0);
            const qtyVal = Number(item.qty || 0);
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{item.name}</td>
                <td>{item.batch_number}</td>
                <td className="right">{qtyVal}</td>
                <td className="right">{mrpRate.toFixed(2)}</td>
                <td className="right">{discountPercent}%</td>
                <td className="right">{sellingRate.toFixed(2)}</td>
                <td className="right">{item.gst_percent || 0}%</td>
                <td className="right">{(sellingRate * qtyVal).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="print-totals">
        <tbody>
          <tr>
            <td>Subtotal:</td>
            <td>{medicine.toFixed(2)}</td>
          </tr>
          {tax > 0 && <tr>
            <td>Tax (GST):</td>
            <td>{tax.toFixed(2)}</td>
          </tr>}
          {specialDiscountAmount > 0 && <tr>
            <td>Special Discount:</td>
            <td>-{specialDiscountAmount.toFixed(2)}</td>
          </tr>}
          {pendingFee > 0 && <tr>
            <td>Pending Doctor Fee:</td>
            <td>{pendingFee.toFixed(2)}</td>
          </tr>}
          <tr className="total-row">
            <td>Grand Total:</td>
            <td>{(total + pendingFee).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div className="print-clear"></div>
      
      <div className="print-footer">
        <p>Thank you for visiting! Wishing you a speedy recovery.</p>
        <p>Generated by {organization?.clinic_name || "Siva Clinic Software"}</p>
      </div>
    </div>
  );
}

// --- Printable Prescription Component ---
export function PrintablePrescription({
  organization,
  patientName,
  patientId,
  mobile,
  patientRow,
  consultation,
  cart,
  date,
  invoiceNo,
  pageBreakBefore,
  pageBreakAfter,
}: any) {
  const vitals = consultation?.vitals || {};
  const rxItems: any[] = Array.isArray(vitals.prescription_items) ? vitals.prescription_items : [];
  const doc = Array.isArray(consultation?.doctor) ? consultation.doctor[0] : consultation?.doctor;
  const pat = Array.isArray(consultation?.patient) ? consultation.patient[0] : (consultation?.patient || patientRow);

  // Build unified medicine list for prescription print:
  // If cart items exist, combine quantities per product and attach doctor dosage/timing from rxItems or cart item
  const medicineRows: Array<{
    name: string;
    category: string;
    schedule: string;
    food: string;
    days: string;
    qty: number;
  }> = [];

  if (Array.isArray(cart) && cart.length > 0) {
    const grouped = new Map<string, { name: string; category?: string; qty: number; dosage_schedule?: string; product_id?: string }>();
    for (const item of cart) {
      const key = String(item.product_id || item.name || "");
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += Number(item.qty || 0);
        if (!existing.dosage_schedule && item.dosage_schedule) existing.dosage_schedule = item.dosage_schedule;
        if (!existing.category && (item.category || (item as any).product?.category)) {
          existing.category = item.category || (item as any).product?.category;
        }
      } else {
        grouped.set(key, {
          name: item.name || "-",
          category: item.category || (item as any).product?.category || "",
          qty: Number(item.qty || 0),
          dosage_schedule: item.dosage_schedule || "",
          product_id: item.product_id,
        });
      }
    }
    for (const g of grouped.values()) {
      const matchedRx = rxItems.find(
        (r) => (g.product_id && r.product_id === g.product_id) || String(r.name || "").toLowerCase() === String(g.name || "").toLowerCase()
      );
      const cat = matchedRx?.category || g.category || "";
      if (matchedRx) {
        const timingLabels: string[] = [];
        if (matchedRx.morning) timingLabels.push("Morning");
        if (matchedRx.afternoon) timingLabels.push("Afternoon");
        if (matchedRx.evening) timingLabels.push("Evening");
        if (matchedRx.night) timingLabels.push("Night");
        const code = `${matchedRx.morning ? 1 : 0}-${matchedRx.afternoon ? 1 : 0}-${matchedRx.evening ? 1 : 0}-${matchedRx.night ? 1 : 0}`;
        medicineRows.push({
          name: g.name,
          category: cat,
          schedule: `${code}${timingLabels.length ? ` (${timingLabels.join(", ")})` : ""}`,
          food: matchedRx.food || "-",
          days: matchedRx.days ? `${matchedRx.days} day(s)` : "-",
          qty: g.qty,
        });
      } else {
        medicineRows.push({
          name: g.name,
          category: cat,
          schedule: g.dosage_schedule || "-",
          food: "-",
          days: "-",
          qty: g.qty,
        });
      }
    }
  } else if (rxItems.length > 0) {
    for (const r of rxItems) {
      const timingLabels: string[] = [];
      if (r.morning) timingLabels.push("Morning");
      if (r.afternoon) timingLabels.push("Afternoon");
      if (r.evening) timingLabels.push("Evening");
      if (r.night) timingLabels.push("Night");
      const code = `${r.morning ? 1 : 0}-${r.afternoon ? 1 : 0}-${r.evening ? 1 : 0}-${r.night ? 1 : 0}`;
      medicineRows.push({
        name: r.name || "-",
        category: r.category || "",
        schedule: `${code}${timingLabels.length ? ` (${timingLabels.join(", ")})` : ""}`,
        food: r.food || "-",
        days: r.days ? `${r.days} day(s)` : "-",
        qty: Number(r.qty || 1),
      });
    }
  }

  const hasVitals = vitals.bp || vitals.sugar || vitals.weight || vitals.temperature || vitals.pulse || vitals.spo2;

  return (
    <div
      className={`print-only print-sheet${pageBreakBefore ? " print-sheet-break-before" : ""}${pageBreakAfter ? " print-sheet-break-after" : ""}`}
      style={{
        ...(pageBreakBefore ? { pageBreakBefore: "always", breakBefore: "page" } : {}),
        ...(pageBreakAfter ? { pageBreakAfter: "always", breakAfter: "page" } : {}),
      }}
    >
      <div className="print-header">
        <h1>{organization?.clinic_name || organization?.pharmacy_name || "CLINIC / HOSPITAL"}</h1>
        <p>{organization?.address || "Address not provided"}</p>
        <p>
          Phone: {organization?.phone || "-"}
          {organization?.drug_license_number ? ` | DL No: ${organization.drug_license_number}` : ""}
        </p>
      </div>

      <div className="print-details">
        <div className="patient-info">
          <strong>Patient Details:</strong><br />
          <strong>{patientName || pat?.name || "Walk-in Patient"}</strong>
          {(pat?.age || pat?.gender) ? ` (${[pat?.age ? `${pat.age} yrs` : "", pat?.gender || ""].filter(Boolean).join(" / ")})` : ""}<br />
          {(patientId || pat?.patient_id) ? `Patient ID: ${patientId || pat?.patient_id}` : ""}<br />
          {(mobile || pat?.mobile) ? `Phone: ${mobile || pat?.mobile}` : ""}
        </div>
        <div className="invoice-info">
          <h2>PRESCRIPTION (Rx)</h2>
          {doc?.name && (
            <>
              <strong>Doctor:</strong> Dr. {String(doc.name).replace(/^Dr\.?\s*/i, "")}
              {doc.qualification ? ` (${doc.qualification})` : ""}
              {doc.specialization ? ` - ${doc.specialization}` : ""}<br />
            </>
          )}
          {vitals.token_no && <><strong>Token No:</strong> #{vitals.token_no}<br /></>}
          {invoiceNo && <><strong>Ref Bill No:</strong> {invoiceNo}<br /></>}
          <strong>Date:</strong> {date ? new Date(date).toLocaleString() : (consultation?.visited_at ? new Date(consultation.visited_at).toLocaleString() : new Date().toLocaleString())}
        </div>
      </div>

      {hasVitals && (
        <div style={{ border: "1px solid #ccc", borderRadius: "6px", padding: "8px 12px", marginBottom: "14px", fontSize: "12px", display: "flex", flexWrap: "wrap", gap: "16px" }}>
          {vitals.bp && <span><strong>BP:</strong> {vitals.bp} mmHg</span>}
          {vitals.sugar && <span><strong>Sugar:</strong> {vitals.sugar} mg/dL</span>}
          {vitals.weight && <span><strong>Weight:</strong> {vitals.weight} kg</span>}
          {vitals.temperature && <span><strong>Temp:</strong> {vitals.temperature} °F</span>}
          {vitals.pulse && <span><strong>Pulse:</strong> {vitals.pulse} bpm</span>}
          {vitals.spo2 && <span><strong>SpO2:</strong> {vitals.spo2}%</span>}
        </div>
      )}

      {(consultation?.symptoms || consultation?.diagnosis || consultation?.clinical_notes) && (
        <div style={{ marginBottom: "16px", fontSize: "13px", lineHeight: 1.5 }}>
          {consultation?.symptoms && <div><strong>Symptoms:</strong> {consultation.symptoms}</div>}
          {consultation?.diagnosis && <div><strong>Past History:</strong> {consultation.diagnosis}</div>}
          {consultation?.clinical_notes && <div><strong>Advice:</strong> {consultation.clinical_notes}</div>}
        </div>
      )}

      <div style={{ fontWeight: 800, fontSize: "15px", marginBottom: "8px" }}>℞ Prescribed Medicines</div>
      <table className="print-table">
        <thead>
          <tr>
            <th style={{ width: "45px" }}>S.No</th>
            <th>Medicine Name</th>
            <th>Category</th>
            <th>Dosage / Timing (M-A-E-N)</th>
            <th>Instruction</th>
            <th>Duration</th>
            <th className="right" style={{ width: "65px" }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {medicineRows.length > 0 ? (
            medicineRows.map((row, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td><strong>{row.name}</strong></td>
                <td>{row.category || "-"}</td>
                <td>{row.schedule}</td>
                <td>{row.food}</td>
                <td>{row.days}</td>
                <td className="right">{row.qty}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} style={{ textAlign: consultation?.prescription_notes ? "left" : "center", padding: "12px" }}>
                {consultation?.prescription_notes ? (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "13px" }}>{consultation.prescription_notes}</div>
                ) : (
                  "No medicines listed"
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {medicineRows.length > 0 && consultation?.prescription_notes && (
        <div style={{ marginBottom: "16px", fontSize: "13px", marginTop: "8px" }}>
          <strong>Rx Notes:</strong> {consultation.prescription_notes}
        </div>
      )}

      {consultation?.follow_up_date && (
        <div style={{ marginBottom: "20px", fontSize: "13px" }}>
          <strong>Follow-up Date:</strong> {new Date(consultation.follow_up_date).toLocaleDateString()}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "45px", paddingTop: "12px", borderTop: "1px dashed #ccc", fontSize: "12px" }}>
        <div>Generated by {organization?.clinic_name || "Siva Clinic Software"}</div>
        <div style={{ textAlign: "right" }}>
          <strong>{doc?.name ? `Dr. ${String(doc.name).replace(/^Dr\.?\s*/i, "")}` : "Doctor's Signature"}</strong>
          {doc?.registration_number ? <div>Reg. No: {doc.registration_number}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function BillingWorkflow({ profile, organization, notify }: { profile: Profile; organization: Organization | null; notify: (message: string) => void }) {
  const [activeTab, setActiveTab] = useState<"billing" | "today-bills">("billing");
  const [patientId, setPatientId] = useState("");
  const [patientRow, setPatientRow] = useState<Row | null>(null);
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [tokenSearch, setTokenSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "bank">("cash");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Row[]>([]);
  const [lastSavedBill, setLastSavedBill] = useState<Row | null>(null);

  // Doctor Prescription (Rx) sync state
  const [pendingRxList, setPendingRxList] = useState<Row[]>([]);
  const [activeRxConsultation, setActiveRxConsultation] = useState<Row | null>(null);
  const [loadingRx, setLoadingRx] = useState(false);
  const [refreshingRx, setRefreshingRx] = useState(false);
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string>>({});

  const salesGstMode = organization?.sales_gst_mode || "price_plus_gst";
  const isPriceOnly = salesGstMode === "price_only";
  const settingDiscount = Number(organization?.sales_discount_percent || 0);
  const minDiscountThreshold = Number(organization?.min_discount_medicine_value || 0);
  const printConfig = getBillingPrintConfig(profile.organization_id, organization);

  const fetchPendingPrescriptions = async (showNotice = false) => {
    if (!supabase) return;
    setRefreshingRx(true);
    try {
      const todayStr = todayInput();
      const { data } = await supabase
        .from("consultations")
        .select("id,patient_id,doctor_id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,doctor_fee_collected,vitals,patient:patients(id,patient_id,name,age,gender,mobile),doctor:doctors(id,name,qualification,specialization,registration_number)")
        .eq("organization_id", profile.organization_id)
        .gte("visited_at", `${todayStr}T00:00:00`)
        .order("visited_at", { ascending: false })
        .limit(100);

      const list = (data || []).filter((r: Row) => {
        const items = r.vitals?.prescription_items;
        const hasRx = (Array.isArray(items) && items.length > 0) || Boolean(r.prescription_notes);
        return hasRx && !r.vitals?.rx_billed;
      });
      setPendingRxList(list);
      if (showNotice) notify(`Prescriptions refreshed (${list.length} ready)`);
    } finally {
      setRefreshingRx(false);
    }
  };

  useEffect(() => {
    fetchPendingPrescriptions();
    const interval = setInterval(() => {
      fetchPendingPrescriptions();
    }, 12000);
    return () => clearInterval(interval);
  }, [profile.organization_id]);

  const handleRefreshAndClear = async () => {
    setPatientId("");
    setPatientRow(null);
    setActiveRxConsultation(null);
    setCart([]);
    setPending([]);
    setProductId("");
    setProduct(null);
    setBarcodeInput("");
    setTokenSearch("");
    setQty(1);
    setSpecialDiscountPercent(0);
    setRatePreview(null);
    await fetchPendingPrescriptions(false);
    notify("Prescriptions refreshed & billing form cleared");
  };

  const loadPrescriptionItemsIntoCart = async (consultationRow: Row, replaceExisting = true) => {
    if (!supabase) return;
    const rxItems: any[] = Array.isArray(consultationRow?.vitals?.prescription_items)
      ? consultationRow.vitals.prescription_items
      : [];
    if (rxItems.length === 0) return;

    setLoadingRx(true);
    try {
      const productIds = rxItems.map((x) => x.product_id).filter(Boolean);
      const { data: prodRows } = await supabase
        .from("products")
        .select("id,product_id,name,category,barcode,gst_percent,mrp,selling_rate,purchase_rate,default_units_per_purchase_unit")
        .in("id", productIds);
      const prodMap = new Map<string, Row>((prodRows || []).map((p: Row) => [p.id, p]));

      let workingCart: Row[] = replaceExisting ? [] : [...cart];
      for (const rx of rxItems) {
        const prod = prodMap.get(rx.product_id) || { id: rx.product_id, name: rx.name };
        const reqQty = Math.max(1, Number(rx.qty || 1));
        const res = await resolveBillingBatchesForProduct(supabase, {
          organizationId: profile.organization_id,
          productId: rx.product_id,
          product: prod,
          requestedQty: reqQty,
          cartItems: workingCart,
          settingDiscount,
          minDiscountThreshold,
          today: todayInput(),
        });
        if (res.allocations && res.allocations.length > 0) {
          const timingParts: string[] = [];
          if (rx.morning) timingParts.push("Morning");
          if (rx.afternoon) timingParts.push("Afternoon");
          if (rx.evening) timingParts.push("Evening");
          if (rx.night) timingParts.push("Night");
          const scheduleStr = `${rx.morning ? 1 : 0}-${rx.afternoon ? 1 : 0}-${rx.evening ? 1 : 0}-${rx.night ? 1 : 0}${timingParts.length ? ` (${timingParts.join(", ")})` : ""}${rx.food ? ` · ${rx.food}` : ""}`;
          const annotated = res.allocations.map((alloc: Row) => ({
            ...alloc,
            category: prod.category || rx.category || "",
            dosage_schedule: scheduleStr,
            prescribed_qty: reqQty,
          }));
          workingCart = [...workingCart, ...annotated];
        }
      }
      setCart(applyBillDiscountRule(workingCart, minDiscountThreshold));
      notify(`Loaded ${rxItems.length} prescribed medicine(s) into bill — you can edit quantities or add items`);
    } finally {
      setLoadingRx(false);
    }
  };

  useEffect(() => {
    if (!patientId || !supabase) {
      setPending([]);
      setActiveRxConsultation(null);
      return;
    }
    supabase
      .from("consultations")
      .select("id,doctor_fee,visited_at")
      .eq("patient_id", patientId)
      .eq("doctor_fee_collected", false)
      .gt("doctor_fee", 0)
      .order("visited_at", { ascending: false })
      .then(({ data }) => setPending(data || []));

    // Fetch latest consultation for this patient to show & auto-load Doctor Prescription
    supabase
      .from("consultations")
      .select("id,patient_id,doctor_id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,vitals,patient:patients(id,patient_id,name,age,gender,mobile),doctor:doctors(id,name,qualification,specialization,registration_number)")
      .eq("patient_id", patientId)
      .order("visited_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data && (Array.isArray(data.vitals?.prescription_items) && data.vitals.prescription_items.length > 0 || data.prescription_notes)) {
          setActiveRxConsultation(data);
          if (!data.vitals?.rx_billed && Array.isArray(data.vitals?.prescription_items) && data.vitals.prescription_items.length > 0) {
            loadPrescriptionItemsIntoCart(data, true);
          }
        } else {
          setActiveRxConsultation(null);
        }
      });
  }, [patientId]);

  useEffect(() => {
    if (!supabase || !activeRxConsultation) return;
    const items = activeRxConsultation.vitals?.prescription_items;
    if (!Array.isArray(items) || items.length === 0) return;
    const needFetchIds = items
      .filter((x: any) => !x.category && x.product_id)
      .map((x: any) => x.product_id);
    if (!needFetchIds.length) return;
    supabase
      .from("products")
      .select("id,category")
      .in("id", needFetchIds)
      .then(({ data }) => {
        if (!data) return;
        setProductCategoryMap((prev) => {
          const next = { ...prev };
          for (const p of data) {
            if (p.id && p.category) next[p.id] = p.category;
          }
          return next;
        });
      });
  }, [activeRxConsultation]);

  const lookupBillingToken = async (rawToken: string) => {
    const clean = rawToken.trim().replace(/^#|^T-/i, "");
    if (!clean || !supabase) return;
    const todayStr = todayInput();
    const { data } = await supabase
      .from("consultations")
      .select("id,patient_id,doctor_id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,vitals,patient:patients(id,patient_id,name,age,gender,mobile),doctor:doctors(id,name,qualification,specialization,registration_number)")
      .eq("organization_id", profile.organization_id)
      .gte("visited_at", `${todayStr}T00:00:00`)
      .order("visited_at", { ascending: false })
      .limit(100);

    const matched: any = (data || []).find((r: Row) => {
      const t = String(r.vitals?.token_no || "").trim().replace(/^#|^T-/i, "");
      return t.toLowerCase() === clean.toLowerCase() || (Number(t) > 0 && Number(t) === Number(clean));
    });

    const pat = Array.isArray(matched?.patient) ? matched.patient[0] : matched?.patient;
    if (matched && pat) {
      setPatientId(pat.id);
      setPatientRow(pat);
      setActiveRxConsultation(matched);
      if (Array.isArray(matched.vitals?.prescription_items) && matched.vitals.prescription_items.length > 0) {
        loadPrescriptionItemsIntoCart(matched, true);
      }
    } else {
      notify(`No consultation found today for Token #${rawToken}`);
    }
  };

  const [ratePreview, setRatePreview] = useState<Row | null>(null);
  const [specialDiscountPercent, setSpecialDiscountPercent] = useState(0);

  // Undiscounted gross bill total (using regular MRP rate * quantity for each item)
  const rawBillTotal = cart.reduce((sum, item) => {
    const unitPrice = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
    return sum + unitPrice * Number(item.qty || 0);
  }, 0);
  const isDiscountEligible = minDiscountThreshold <= 0 || rawBillTotal >= minDiscountThreshold;

  const medicine = cart.reduce((sum, item) => sum + (isPriceOnly ? Number(item.selling_rate) * Number(item.qty) : (Number(item.selling_rate) * Number(item.qty)) / (1 + Number(item.gst_percent || 0) / 100)), 0);
  const tax = cart.reduce((sum, item) => sum + (isPriceOnly ? Number(item.selling_rate) * Number(item.qty) * Number(item.gst_percent || 0) / 100 : Number(item.selling_rate) * Number(item.qty) - (Number(item.selling_rate) * Number(item.qty)) / (1 + Number(item.gst_percent || 0) / 100)), 0);
  const grossTotal = isPriceOnly ? medicine + tax : cart.reduce((sum, item) => sum + Number(item.selling_rate) * Number(item.qty), 0);
  const specialDiscountAmount = Number(((medicine + tax) * (Number(specialDiscountPercent || 0) / 100)).toFixed(2));
  const total = Math.max(0, grossTotal - specialDiscountAmount);

  useEffect(() => {
    if (!cart.length) return;
    const updated = applyBillDiscountRule(cart, minDiscountThreshold);
    const hasChange = updated.some(
      (item, idx) =>
        item.sales_discount_percent !== cart[idx]?.sales_discount_percent ||
        Math.abs(Number(item.selling_rate) - Number(cart[idx]?.selling_rate)) > 0.001
    );
    if (hasChange) {
      setCart(updated);
    }
  }, [cart, minDiscountThreshold]);

  useEffect(() => {
    if (!supabase || !productId) {
      setRatePreview(null);
      return;
    }
    let alive = true;
    fetchBillingRatePreview(supabase, {
      productId,
      product,
      settingDiscount,
      isPriceOnly,
      minDiscountThreshold,
      today: todayInput(),
    }).then((preview) => {
      if (!alive || !preview) return;
      setRatePreview(preview);
    });
    return () => { alive = false; };
  }, [productId, product, settingDiscount, isPriceOnly, minDiscountThreshold]);

  const add = async () => {
    if (!supabase || !productId || Number(qty) <= 0) {
      notify("Select medicine and quantity");
      return;
    }
    const res = await resolveBillingBatchesForProduct(supabase, {
      organizationId: profile.organization_id,
      productId,
      product,
      requestedQty: Number(qty),
      cartItems: cart,
      settingDiscount,
      minDiscountThreshold,
      today: todayInput(),
    });
    if (res.error || !res.allocations.length) {
      notify(res.error || "Unable to add medicine to bill");
      return;
    }
    setCart((items) => applyBillDiscountRule([...items, ...res.allocations], minDiscountThreshold));
    if (res.wentNegative) {
      notify(`Added to bill — stock will go to ${res.projectedBalance} (negative stock will auto-fill on purchase)`);
    }
    setProductId("");
    setProduct(null);
    setRatePreview(null);
    setQty(1);
  };

  const scanBarcode = async (code: string) => {
    const clean = code.trim();
    if (!clean || !supabase) return;
    const { data: prod } = await supabase
      .from("products")
      .select("id,product_id,name,barcode,gst_percent,mrp,selling_rate,purchase_rate,default_units_per_purchase_unit")
      .eq("organization_id", profile.organization_id)
      .or(`barcode.eq.${clean},product_id.ilike.${clean}`)
      .limit(1)
      .maybeSingle();

    if (!prod) {
      notify(`No medicine found for barcode/code "${clean}"`);
      return;
    }

    const res = await resolveBillingBatchesForProduct(supabase, {
      organizationId: profile.organization_id,
      productId: prod.id,
      product: prod,
      requestedQty: Number(qty) > 0 ? Number(qty) : 1,
      cartItems: cart,
      settingDiscount,
      minDiscountThreshold,
      today: todayInput(),
    });
    if (res.error || !res.allocations.length) {
      notify(res.error || "Unable to add scanned medicine");
      return;
    }
    setCart((items) => applyBillDiscountRule([...items, ...res.allocations], minDiscountThreshold));
    setBarcodeInput("");
    setQty(1);
    notify(`Scanned & added ${prod.name}`);
  };

  const changeQty = (index: number, next: any) => {
    if (next === "") {
      setCart((items) => items.map((item, i) => i !== index ? item : { ...item, qty: "" }));
      return;
    }
    const value = Number(next);
    if (!Number.isFinite(value) || value < 0) {
      notify("Quantity must be positive");
      return;
    }
    setCart((items) => {
      const updated = items.map((item, i) => i !== index ? item : { ...item, qty: value });
      return applyBillDiscountRule(updated, minDiscountThreshold);
    });
  };

  const changeMrpRate = (index: number, next: any) => {
    if (next === "") {
      setCart((items) => items.map((item, i) => i !== index ? item : { ...item, mrp_unit_rate: "", selling_rate: 0 }));
      return;
    }
    const value = Number(next);
    if (!Number.isFinite(value) || value < 0) return;
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const discount = Number(item.sales_discount_percent || 0);
      const sellingRate = discountedSaleRate(value, 1, discount);
      return {
        ...item,
        mrp_unit_rate: value,
        mrp: Number(item.mrp || 0) > 0 ? item.mrp : value,
        selling_rate: sellingRate,
        rate_edited: Math.abs(sellingRate - Number(item.original_selling_rate || 0)) > 0.001,
      };
    }));
  };

  const changeDiscount = (index: number, next: any) => {
    if (next === "") {
      setCart((items) => items.map((item, i) => i !== index ? item : { ...item, sales_discount_percent: "" }));
      return;
    }
    const value = Number(next);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      notify("Discount must be between 0 and 100");
      return;
    }
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const baseRate = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
      const sellingRate = discountedSaleRate(baseRate, 1, value);
      const changed = Math.abs(value - Number(item.original_sales_discount_percent || 0)) > 0.001;
      return {
        ...item,
        sales_discount_percent: value,
        original_sales_discount_percent: value,
        configured_discount_percent: value,
        selling_rate: sellingRate,
        rate_edited: changed,
      };
    }));
  };

  const save = async () => {
    if (!supabase || !cart.length) {
      notify("Add at least one medicine");
      return;
    }
    if (cart.some((item) => !item.qty || Number(item.qty) <= 0)) {
      notify("Please fill out valid quantities for all medicines");
      return;
    }
    if (Number(specialDiscountPercent || 0) < 0 || Number(specialDiscountPercent || 0) > 100) {
      notify("Special discount must be between 0 and 100");
      return;
    }
    setSaving(true);
    const finalCart = applyBillDiscountRule(cart, minDiscountThreshold);
    const fee = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);
    const invoice = `V2-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const hasRateEdit = finalCart.some((item) => item.rate_edited) || Number(specialDiscountPercent || 0) > 0;
    const pharmacyRevenue = Math.max(0, medicine + tax - specialDiscountAmount);
    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patientId || null,
      consultation_id: pending.length === 1 ? pending[0].id : (activeRxConsultation?.id || null),
      medicine_subtotal: medicine,
      medicine_tax: tax,
      pharmacy_revenue: pharmacyRevenue,
      doctor_fee: fee,
      gross_total: grossTotal,
      special_discount_percent: Number(specialDiscountPercent || 0),
      special_discount_amount: specialDiscountAmount,
      grand_total: total + fee,
      payment_mode: paymentMode,
      has_rate_edit: hasRateEdit,
      rate_edit_verified: !hasRateEdit,
      status: "completed",
      created_by: profile.id,
    }).select("id").single();
    if (error || !sale) {
      setSaving(false);
      notify(error?.message || "Sale save failed");
      return;
    }
    if (activeRxConsultation?.id) {
      await supabase
        .from("consultations")
        .update({
          vitals: { ...(activeRxConsultation.vitals || {}), rx_billed: true, billed_sale_id: sale.id },
        })
        .eq("id", activeRxConsultation.id)
        .eq("organization_id", profile.organization_id);
    }
    for (const p of pending) {
      await supabase.rpc("collect_consultation_fee", {
        p_consultation_id: p.id,
        p_sale_id: sale.id
      });
    }
    for (const item of finalCart) {
      await supabase.from("sale_items").insert({
        organization_id: profile.organization_id,
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.qty,
        unit_rate: item.selling_rate,
        original_unit_rate: item.original_selling_rate || item.selling_rate,
        rate_edited: !!item.rate_edited,
        mrp: Number(item.mrp || item.mrp_unit_rate || item.selling_rate || 0),
        mrp_unit_rate: Number(item.mrp_unit_rate || item.selling_rate || 0),
        original_sales_discount_percent: item.original_sales_discount_percent,
        sales_discount_percent: item.sales_discount_percent === "" ? 0 : item.sales_discount_percent,
        gst_percent: item.gst_percent || 0,
        line_total: Number(item.selling_rate) * Number(item.qty)
      });
      await deductSaleItemStock(supabase, {
        organizationId: profile.organization_id,
        saleId: sale.id,
        invoiceNo: invoice,
        createdBy: profile.id,
        item,
        referenceType: "sale",
      });
    }
    const collectedAmount = total + fee;
    if (collectedAmount > 0) {
      await supabase.from("cash_ledger").insert({
        organization_id: profile.organization_id,
        occurred_at: new Date().toISOString(),
        entry_type: "receipt",
        category: "Pharmacy sale",
        reference_type: "sale",
        reference_id: sale.id,
        amount: collectedAmount,
        payment_mode: paymentMode,
        created_by: profile.id,
      });
    }
    try {
      const netPharmacySales = Math.max(0, Number((total - tax).toFixed(2)));
      const effectiveTax = Math.max(0, Number((total - netPharmacySales).toFixed(2)));
      const lines: Array<{ ledger: string; debit?: number; credit?: number }> = [
        { ledger: paymentMode === "cash" ? "Cash" : "Bank", debit: Number((total + fee).toFixed(2)) },
      ];
      if (netPharmacySales > 0) lines.push({ ledger: "Pharmacy Sales", credit: netPharmacySales });
      if (effectiveTax > 0) lines.push({ ledger: "GST Payable", credit: effectiveTax });
      if (fee > 0) lines.push({ ledger: "Consultation Revenue", credit: Number(fee.toFixed(2)) });
      await postJournal(profile, { voucherType: "sale", entryDate: new Date().toISOString(), referenceType: "sale", referenceId: sale.id, referenceNumber: invoice, narration: `Sale bill ${invoice} (${paymentMode.toUpperCase()})`, lines });
    } catch {}
    setLastSavedBill({
      patientName: patientRow?.name || "Walk-in Patient",
      patientId: patientRow?.patient_id || "",
      mobile: patientRow?.mobile || "",
      patientRow: patientRow ? { ...patientRow } : null,
      consultation: activeRxConsultation ? { ...activeRxConsultation } : null,
      invoiceNo: invoice,
      date: new Date().toISOString(),
      cart: [...finalCart],
      medicine,
      tax,
      specialDiscountAmount,
      total,
      pendingFee: fee,
    });
    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    setPatientId("");
    setPatientRow(null);
    setActiveRxConsultation(null);
    setPending([]);
    setProductId("");
    setProduct(null);
    setQty(1);
    setRatePreview(null);
    fetchPendingPrescriptions();
    notify(`${invoice} saved (${paymentMode.toUpperCase()})`);
    const latestPrintCfg = getBillingPrintConfig(profile.organization_id, organization);
    if (latestPrintCfg.print_prescription || latestPrintCfg.print_bill) {
      setTimeout(() => {
        triggerUniversalPrint();
      }, 250);
    }
  };

  const printSource = cart.length > 0 || !lastSavedBill
    ? {
        patientName: patientRow?.name || "Walk-in Patient",
        patientId: patientRow?.patient_id || "",
        mobile: patientRow?.mobile || "",
        patientRow,
        consultation: activeRxConsultation,
        invoiceNo: "",
        date: "",
        cart,
        medicine,
        tax,
        specialDiscountAmount,
        total,
        pendingFee: pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0),
      }
    : lastSavedBill;

  const printModeLabel =
    printConfig.print_prescription && printConfig.print_bill
      ? "Prescription + Bill"
      : printConfig.print_prescription
      ? "Prescription Only"
      : printConfig.print_bill
      ? "Bill Only"
      : "Print Disabled";

  return <div>
      {printConfig.print_prescription && (
        <PrintablePrescription
          organization={organization}
          patientName={printSource.patientName}
          patientId={printSource.patientId}
          mobile={printSource.mobile}
          patientRow={printSource.patientRow}
          consultation={printSource.consultation}
          cart={printSource.cart}
          date={printSource.date}
          invoiceNo={printSource.invoiceNo}
          pageBreakAfter={printConfig.print_bill}
        />
      )}
      {printConfig.print_bill && (
        <PrintableInvoice
          organization={organization}
          patientName={printSource.patientName}
          patientId={printSource.patientId}
          mobile={printSource.mobile}
          invoiceNo={printSource.invoiceNo}
          date={printSource.date}
          cart={printSource.cart}
          medicine={printSource.medicine}
          tax={printSource.tax}
          specialDiscountAmount={printSource.specialDiscountAmount}
          total={printSource.total}
          pendingFee={printSource.pendingFee}
          title="PHARMACY INVOICE"
          pageBreakBefore={printConfig.print_prescription}
        />
      )}
      <div className="no-print">
        <div className="tab-row" style={{ marginBottom: "16px" }}>
          <button
            type="button"
            className={activeTab === "billing" ? "active" : ""}
            onClick={() => setActiveTab("billing")}
          >
            Billing
          </button>
          <button
            type="button"
            className={activeTab === "today-bills" ? "active" : ""}
            onClick={() => setActiveTab("today-bills")}
          >
            Today&apos;s Bills
          </button>
        </div>

        {activeTab === "today-bills" ? (
          <SalesRegisterWorkflow
            profile={profile}
            organization={organization}
            notify={notify}
            todayOnly={true}
            hideHeader={false}
          />
        ) : (
          <>
        <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1>Billing {cart.length > 0 && <span className="billing-head-total">{money(total + pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0))}</span>}</h1>
            <p>Load Doctor Prescription automatically or bill directly from paper prescription.</p>
          </div>
          <div className="print-hide" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '6px 10px', borderRadius: '999px', background: '#f0fdf4', color: '#0f766e', border: '1px solid #99f6e4' }}>
              Print Setting: {printModeLabel}
            </span>
            <button className="secondary" onClick={() => triggerUniversalPrint()} style={{ minHeight: '38px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Print ({printModeLabel})
            </button>
            <button className="secondary" onClick={() => { alert("In the print dialog, select 'Save as PDF' as your printer."); triggerUniversalPrint(); }} style={{ minHeight: '38px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              PDF Export
            </button>
          </div>
        </div>

  {/* Pending Doctor Prescriptions Queue */}
  <div className="panel" style={{ marginBottom: "14px", background: "#f0fdf4", border: "1px solid #86efac", padding: "10px 16px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <strong style={{ color: "#166534", fontSize: "13px" }}>Today&apos;s Doctor Prescriptions Ready for Billing ({pendingRxList.length}):</strong>
        {pendingRxList.length === 0 ? (
          <span style={{ fontSize: "13px", color: "#64748b", fontStyle: "italic" }}>No pending doctor prescriptions</span>
        ) : (
          pendingRxList.map((rx) => {
            const itemCount = Array.isArray(rx.vitals?.prescription_items) ? rx.vitals.prescription_items.length : 0;
            const isSelected = activeRxConsultation?.id === rx.id;
            return (
              <button
                key={rx.id}
                type="button"
                onClick={() => {
                  if (rx.patient) {
                    setPatientId(rx.patient.id);
                    setPatientRow(rx.patient);
                  }
                  setActiveRxConsultation(rx);
                  if (itemCount > 0) loadPrescriptionItemsIntoCart(rx, true);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: isSelected ? "2px solid #0f766e" : "1px solid #4ade80",
                  background: isSelected ? "#0f766e" : "#fff",
                  color: isSelected ? "#fff" : "#14532d",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {rx.vitals?.token_no ? `#${rx.vitals.token_no} · ` : ""}
                {rx.patient?.name || "Patient"}
              </button>
            );
          })
        )}
      </div>
      <button
        type="button"
        className="secondary"
        onClick={handleRefreshAndClear}
        disabled={refreshingRx}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "32px", fontSize: "12px", padding: "4px 10px" }}
        title="Refresh pending prescriptions & clear form"
      >
        <RefreshCw size={13} className={refreshingRx ? "spin" : ""} /> {refreshingRx ? "Refreshing..." : "Refresh & Clear"}
      </button>
    </div>
  </div>

  <div className="panel billing-panel">
    {/* Full Length Patient Selector Row */}
    <div style={{ marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-end", width: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
        <AsyncSelect
          table="patients"
          select="id,patient_id,name,mobile"
          searchColumns={["patient_id", "name", "mobile"]}
          label="Patient / walk-in"
          value={patientId}
          displayValue={patientRow ? patientText(patientRow) : undefined}
          onChange={(id, row) => { setPatientId(id); setPatientRow(row || null); }}
          render={patientText}
        />
      </div>
      <QuickPatientModal organizationId={profile.organization_id} notify={notify} onCreated={(created) => { setPatientId(created.id); setPatientRow(created); }} />
    </div>

    {/* Token Lookup, Barcode Scan, and Refresh & Clear Toolbar Row */}
    <div className="billing-patient-line" style={{ marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
      <label className="field" style={{ flex: "1 1 180px", margin: 0 }}>
        <span>Token # Lookup</span>
        <input
          value={tokenSearch}
          onChange={(e) => setTokenSearch(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lookupBillingToken(tokenSearch);
            }
          }}
          placeholder="Token # + Enter"
        />
      </label>
      <label className="field" style={{ flex: "1 1 240px", margin: 0 }}>
        <span>Barcode / Code Quick Scan</span>
        <input value={barcodeInput} onChange={(e) => setBarcodeInput(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanBarcode(barcodeInput); } }} placeholder="Scan barcode & press Enter"/>
      </label>
      <button
        type="button"
        className="secondary"
        onClick={handleRefreshAndClear}
        disabled={refreshingRx}
        style={{ minHeight: "38px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        title="Refresh prescriptions and clear all filled data"
      >
        <RefreshCw size={14} className={refreshingRx ? "spin" : ""} /> Refresh &amp; Clear
      </button>
    </div>

    {/* Doctor Prescription Viewer Box inside Billing */}
    {activeRxConsultation && (
      <div style={{ marginBottom: "18px", padding: "14px", background: "#f8fafc", border: "1px solid #94a3b8", borderRadius: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
          <div>
            <strong style={{ color: "#0f5144", fontSize: "15px" }}>
              Doctor Prescription {activeRxConsultation.vitals?.token_no ? `(Token #${activeRxConsultation.vitals.token_no})` : ""}
            </strong>
            <span style={{ marginLeft: "10px", fontSize: "13px", color: "#475569" }}>
              Dr. {activeRxConsultation.doctor?.name || "Doctor"} · {new Date(activeRxConsultation.visited_at).toLocaleString()}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {Array.isArray(activeRxConsultation.vitals?.prescription_items) && activeRxConsultation.vitals.prescription_items.length > 0 && (
              <button
                type="button"
                className="secondary"
                disabled={loadingRx}
                onClick={() => loadPrescriptionItemsIntoCart(activeRxConsultation, true)}
                style={{ minHeight: "34px", fontSize: "13px" }}
              >
                {loadingRx ? "Loading..." : "Reload Prescribed Items to Bill"}
              </button>
            )}
            <button
              type="button"
              className="secondary danger-btn"
              onClick={() => {
                setActiveRxConsultation(null);
                notify("Prescription / Token cleared from bill");
              }}
              style={{ minHeight: "34px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "4px" }}
              title="Remove/detach this prescription from current bill"
            >
              <X size={14} /> Clear Token / Rx
            </button>
          </div>
        </div>

        {Array.isArray(activeRxConsultation.vitals?.prescription_items) && activeRxConsultation.vitals.prescription_items.length > 0 ? (
          <div className="data-wrap" style={{ marginTop: "6px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Prescribed Medicine</th>
                  <th>Category</th>
                  <th>Morning</th>
                  <th>Afternoon</th>
                  <th>Evening</th>
                  <th>Night</th>
                  <th>Food</th>
                  <th>Days</th>
                  <th>Prescribed Qty</th>
                </tr>
              </thead>
              <tbody>
                {activeRxConsultation.vitals.prescription_items.map((item: any, idx: number) => {
                  const cat = item.category || productCategoryMap[item.product_id] || "";
                  return (
                    <tr key={`${item.product_id}-${idx}`}>
                      <td><strong>{item.name}</strong></td>
                      <td>
                        {cat ? (
                          <span style={{ fontSize: "11px", padding: "2px 8px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "12px", fontWeight: 600 }}>
                            {cat}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td>{item.morning ? "✓" : "-"}</td>
                      <td>{item.afternoon ? "✓" : "-"}</td>
                      <td>{item.evening ? "✓" : "-"}</td>
                      <td>{item.night ? "✓" : "-"}</td>
                      <td>{item.food || "-"}</td>
                      <td>{item.days || "-"}</td>
                      <td><strong>{item.qty}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", color: "#1e293b", background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            {activeRxConsultation.prescription_notes || "No digital medicines entered (bill directly from paper prescription below)."}
          </div>
        )}
      </div>
    )}

    <div className="billing-entry-line">
      <AsyncSelect
        table="products"
        select="id,product_id,name,gst_percent,mrp,selling_rate,purchase_rate,default_units_per_purchase_unit"
        searchColumns={["product_id", "name", "barcode", "generic_name"]}
        label="Add / Edit Medicine (or Direct Paper Rx Entry)"
        value={productId}
        onChange={(id, row) => {
          setProductId(id);
          setProduct(row || null);
          setRatePreview(null);
        }}
        render={productText}
      />
      <label className="field qty-field">
        <span>Quantity</span>
        <input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))} />
      </label>
      <button type="button" className="primary" onClick={add}>
        <Plus size={16} /> Add
      </button>
    </div>

    {ratePreview && (
      <div className="auth-message stock-preview">
        Stock: <b style={{ color: Number(ratePreview.available_stock) <= 0 ? "#c53030" : undefined }}>{ratePreview.available_stock}{Number(ratePreview.available_stock) <= 0 ? " (Negative billing enabled)" : ""}</b> · MRP rate: <b>{money(ratePreview.mrp_unit_rate)}</b> · Discount: <b>{Number(ratePreview.sales_discount_percent || 0)}%</b> · Final rate: <b>{money(ratePreview.final_rate)}</b> · Billing rate: <b>{money(ratePreview.bill_rate)}</b>
      </div>
    )}

    {cart.length ? (
      <>
        {minDiscountThreshold > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: isDiscountEligible ? "#f0fdf4" : "#fffbeb",
              border: isDiscountEligible ? "1px solid #86efac" : "1px solid #fde68a",
              color: isDiscountEligible ? "#166534" : "#92400e",
            }}
          >
            {isDiscountEligible ? (
              <>
                <CheckCircle2 size={16} style={{ color: "#16a34a", flexShrink: 0 }} />
                <span>
                  Bill Total (MRP {money(rawBillTotal)}) qualifies for medicine discount (Min: {money(minDiscountThreshold)}).
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={16} style={{ color: "#d97706", flexShrink: 0 }} />
                <span>
                  Bill Total (MRP {money(rawBillTotal)}) is below minimum {money(minDiscountThreshold)} for discount. 0% discount applied to this bill.
                </span>
              </>
            )}
          </div>
        )}

        <div className="data-wrap">
          <table className="data-table billing-table">
            <thead>
              <tr>
                <th className="col-med">Medicine</th>
                <th className="col-qty" style={{ width: "90px" }}>Qty</th>
                <th className="col-rate" style={{ width: "110px" }}>Discount %</th>
                <th className="col-rate" style={{ width: "110px" }}>Final rate</th>
                <th className="col-total" style={{ width: "120px" }}>Total</th>
                <th className="col-action" style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, index) => (
                <tr key={`${item.batch_id}-${index}`} className="cart-row-interactive">
                  <td className="col-med">
                    <strong>{item.name}</strong>
                    {item.dosage_schedule && (
                      <div style={{ fontSize: "11px", color: "#0f766e", fontWeight: 600 }}>Rx: {item.dosage_schedule}</div>
                    )}
                  </td>
                  <td className="col-qty">
                    <input
                      className="table-qty-input"
                      type="number"
                      min="1"
                      step="1"
                      value={item.qty}
                      onChange={(event) => changeQty(index, event.currentTarget.value === "" ? "" : Number(event.currentTarget.value))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="col-rate">
                    <input
                      className="table-qty-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.sales_discount_percent ?? 0}
                      onChange={(event) => changeDiscount(index, event.currentTarget.value === "" ? "" : Number(event.currentTarget.value))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="col-rate">{money(item.selling_rate)}</td>
                  <td className="col-total">
                    <strong>{money(Number(item.selling_rate) * Number(item.qty))}</strong>
                  </td>
                  <td className="col-action">
                    <button
                      className="table-edit danger-btn"
                      onClick={() => setCart((items) => applyBillDiscountRule(items.filter((_, i) => i !== index), minDiscountThreshold))}
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="checkout sales-checkout">
          <label className="field qty-field special-discount-field">
            <span>Payment mode</span>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.currentTarget.value as any)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
            </select>
          </label>
          <label className="field qty-field special-discount-field">
            <span>Additional special discount %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={specialDiscountPercent}
              onChange={(event) => setSpecialDiscountPercent(Number(event.currentTarget.value))}
            />
          </label>
          {pending.length > 0 && (
            <div
              className="fee-banner auth-message"
              style={{
                marginBottom: "16px",
                background: "#fff5f5",
                color: "#c53030",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #fed7d7",
              }}
            >
              Pending doctor fee ({pending.length}) will be collected: <b>{money(pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0))}</b>
            </div>
          )}
          {(() => {
            const doctorFeeTotal = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);
            const grandTotal = total + doctorFeeTotal;
            return (
              <div className="totals-mini" style={{ alignItems: "center" }}>
                <span>Total <b>{money(total)}</b></span>
                {Number(specialDiscountPercent || 0) > 0 && (
                  <span>Special discount <b>-{money(specialDiscountAmount)}</b></span>
                )}
                <span>Doctor Fees <b>{money(doctorFeeTotal)}</b></span>
                <strong
                  className="billing-grand-total"
                  style={{
                    fontSize: "clamp(32px, 4vw, 44px)",
                    fontWeight: 900,
                    color: "#dc2626",
                    textDecoration: "underline",
                    textDecorationColor: "#dc2626",
                    textUnderlineOffset: "6px",
                    textDecorationThickness: "3px",
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: "8px",
                  }}
                >
                  Grand Total{" "}
                  <b
                    style={{
                      fontSize: "clamp(32px, 4vw, 44px)",
                      fontWeight: 900,
                      color: "#dc2626",
                      textDecoration: "underline",
                      textDecorationColor: "#dc2626",
                      textUnderlineOffset: "6px",
                      textDecorationThickness: "3px",
                      marginLeft: "6px",
                    }}
                  >
                    {money(grandTotal)}
                  </b>
                </strong>
              </div>
            );
          })()}
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? <LoaderCircle className="spin" /> : <CheckCircle2 size={16} />} Complete sale ({paymentMode.toUpperCase()})
          </button>
        </div>
      </>
    ) : (
      <div className="empty">
        <h3>No medicines added.</h3>
        <p>Select a patient/token to load doctor prescription, or add medicines directly from paper prescription.</p>
      </div>
    )}
  </div>
        </>
      )}
    </div>
  </div>;
}

export { SalesRegisterWorkflow as SalesWorkflow };

export function InpatientBillingWorkflow({ profile, organization, notify }: { profile: Profile; organization: Organization | null; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Row[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) { setBalance(null); setPending([]); return; }
    // Fetch ledger balance
    supabase.from("patient_ledger").select("debit,credit").eq("patient_id", patientId).then(({ data }) => {
      if (!data) { setBalance(null); return; }
      const bal = data.reduce((sum: number, r: any) => sum + Number(r.debit || 0) - Number(r.credit || 0), 0);
      setBalance(bal);
    });
    // Fetch pending doctor fees
    supabase.from("consultations").select("id,doctor_fee,visited_at").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).order("visited_at", { ascending: false }).then(({ data }) => setPending(data || []));
  }, [patientId]);

  const [ratePreview, setRatePreview] = useState<Row | null>(null);
  const [specialDiscountPercent, setSpecialDiscountPercent] = useState(0);
  const salesGstMode = organization?.sales_gst_mode || "price_plus_gst";
  const isPriceOnly = salesGstMode === "price_only";
  const settingDiscount = Number(organization?.sales_discount_percent || 0);
  const minDiscountThreshold = Number(organization?.min_discount_medicine_value || 0);

  // Undiscounted gross bill total (using regular MRP rate * quantity for each item)
  const rawBillTotal = cart.reduce((sum, item) => {
    const unitPrice = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
    return sum + unitPrice * Number(item.qty || 0);
  }, 0);
  const isDiscountEligible = minDiscountThreshold <= 0 || rawBillTotal >= minDiscountThreshold;

  const medicine = cart.reduce((sum, item) => sum + (isPriceOnly ? Number(item.selling_rate) * Number(item.qty) : (Number(item.selling_rate) * Number(item.qty)) / (1 + Number(item.gst_percent || 0) / 100)), 0);
  const tax = cart.reduce((sum, item) => sum + (isPriceOnly ? Number(item.selling_rate) * Number(item.qty) * Number(item.gst_percent || 0) / 100 : Number(item.selling_rate) * Number(item.qty) - (Number(item.selling_rate) * Number(item.qty)) / (1 + Number(item.gst_percent || 0) / 100)), 0);
  const grossTotal = isPriceOnly ? medicine + tax : cart.reduce((sum, item) => sum + Number(item.selling_rate) * Number(item.qty), 0);
  const specialDiscountAmount = Number(((medicine + tax) * (Number(specialDiscountPercent || 0) / 100)).toFixed(2));
  const total = Math.max(0, grossTotal - specialDiscountAmount);
  
  const pendingFee = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);

  useEffect(() => {
    if (!cart.length) return;
    const updated = applyBillDiscountRule(cart, minDiscountThreshold);
    const hasChange = updated.some(
      (item, idx) =>
        item.sales_discount_percent !== cart[idx]?.sales_discount_percent ||
        Math.abs(Number(item.selling_rate) - Number(cart[idx]?.selling_rate)) > 0.001
    );
    if (hasChange) {
      setCart(updated);
    }
  }, [cart, minDiscountThreshold]);

  useEffect(() => {
    if (!supabase || !productId) {
      setRatePreview(null);
      return;
    }
    let alive = true;
    fetchBillingRatePreview(supabase, {
      productId,
      product,
      settingDiscount,
      isPriceOnly,
      minDiscountThreshold,
      today: todayInput(),
    }).then((preview) => {
      if (!alive || !preview) return;
      setRatePreview(preview);
    });
    return () => { alive = false; };
  }, [productId, product, settingDiscount, isPriceOnly, minDiscountThreshold]);

  const add = async () => {
    if (!supabase || !productId || Number(qty) <= 0) {
      notify("Select medicine and quantity");
      return;
    }
    const res = await resolveBillingBatchesForProduct(supabase, {
      organizationId: profile.organization_id,
      productId,
      product,
      requestedQty: Number(qty),
      cartItems: cart,
      settingDiscount,
      minDiscountThreshold,
      today: todayInput(),
    });
    if (res.error || !res.allocations.length) {
      notify(res.error || "Unable to add medicine to bill");
      return;
    }
    setCart((items) => applyBillDiscountRule([...items, ...res.allocations], minDiscountThreshold));
    if (res.wentNegative) {
      notify(`Added to bill — stock will go to ${res.projectedBalance} (negative stock will auto-fill on purchase)`);
    }
    setProductId("");
    setProduct(null);
    setRatePreview(null);
    setQty(1);
  };

  const changeQty = (index: number, next: any) => {
    if (next === "") {
      setCart((items) => items.map((item, i) => i === index ? { ...item, qty: "" } : item));
      return;
    }
    const value = Number(next);
    if (!Number.isFinite(value) || value < 0) {
      notify("Quantity must be positive");
      return;
    }
    setCart((items) => {
      const updated = items.map((item, i) => i === index ? { ...item, qty: value } : item);
      return applyBillDiscountRule(updated, minDiscountThreshold);
    });
  };
  const changeMrpRate = (index: number, next: any) => {
    if (next === "") {
      setCart((items) => items.map((item, i) => i !== index ? item : { ...item, mrp_unit_rate: "", selling_rate: 0 }));
      return;
    }
    const value = Number(next);
    if (!Number.isFinite(value) || value < 0) return;
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const discount = Number(item.sales_discount_percent || 0);
      const sellingRate = discountedSaleRate(value, 1, discount);
      return {
        ...item,
        mrp_unit_rate: value,
        mrp: Number(item.mrp || 0) > 0 ? item.mrp : value,
        selling_rate: sellingRate,
        rate_edited: Math.abs(sellingRate - Number(item.original_selling_rate || 0)) > 0.001,
      };
    }));
  };
  const changeDiscount = (index: number, value: any) => {
    if (value === "") {
      setCart((items) => items.map((item, i) => i === index ? { ...item, sales_discount_percent: "" } : item));
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
      notify("Discount must be between 0 and 100");
      return;
    }
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const baseRate = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
      const sellingRate = discountedSaleRate(baseRate, 1, numericValue);
      const changed = Math.abs(numericValue - Number(item.original_sales_discount_percent || 0)) > 0.001;
      return {
        ...item,
        sales_discount_percent: numericValue,
        original_sales_discount_percent: numericValue,
        configured_discount_percent: numericValue,
        selling_rate: sellingRate,
        rate_edited: changed,
      };
    }));
  };

  const save = async () => {
    if (!supabase || !patientId || !cart.length) {
      notify("Select inpatient and add medicines");
      return;
    }
    if (cart.some((item) => !item.qty || Number(item.qty) <= 0)) {
      notify("Please fill out valid quantities for all medicines");
      return;
    }
    if (Number(specialDiscountPercent || 0) < 0 || Number(specialDiscountPercent || 0) > 100) {
      notify("Special discount must be between 0 and 100");
      return;
    }
    setSaving(true);
    const finalCart = applyBillDiscountRule(cart, minDiscountThreshold);
    const invoice = `IP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const hasRateEdit = finalCart.some((item) => item.rate_edited) || Number(specialDiscountPercent || 0) > 0;
    const pharmacyRevenue = Math.max(0, medicine + tax - specialDiscountAmount);
    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patientId,
      consultation_id: null,
      medicine_subtotal: medicine,
      medicine_tax: tax,
      pharmacy_revenue: pharmacyRevenue,
      doctor_fee: 0,
      gross_total: grossTotal,
      special_discount_percent: Number(specialDiscountPercent || 0),
      special_discount_amount: specialDiscountAmount,
      grand_total: total,
      payment_mode: "credit",
      sale_type: "inpatient",
      has_rate_edit: hasRateEdit,
      rate_edit_verified: !hasRateEdit,
      status: "completed",
      created_by: profile.id,
    }).select("id").single();
    if (error || !sale) {
      setSaving(false);
      notify(error?.message || "Inpatient bill save failed.");
      return;
    }
    for (const p of pending) {
      await supabase.rpc("collect_consultation_fee", {
        p_consultation_id: p.id,
        p_sale_id: sale.id
      });
    }
    for (const item of finalCart) {
      await supabase.from("sale_items").insert({
        organization_id: profile.organization_id,
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.qty,
        unit_rate: item.selling_rate,
        original_unit_rate: item.original_selling_rate || item.selling_rate,
        rate_edited: !!item.rate_edited,
        mrp: Number(item.mrp || item.mrp_unit_rate || item.selling_rate || 0),
        mrp_unit_rate: Number(item.mrp_unit_rate || item.selling_rate || 0),
        original_sales_discount_percent: item.original_sales_discount_percent,
        sales_discount_percent: item.sales_discount_percent === "" ? 0 : item.sales_discount_percent,
        gst_percent: item.gst_percent || 0,
        line_total: Number(item.selling_rate) * Number(item.qty)
      });
      await deductSaleItemStock(supabase, {
        organizationId: profile.organization_id,
        saleId: sale.id,
        invoiceNo: invoice,
        createdBy: profile.id,
        item,
        referenceType: "inpatient_sale",
      });
    }
    
    // Post medicine bill to patient ledger
    await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Inpatient medicine bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: total, credit: 0, created_by: profile.id });
    // If doctor fees pending, post separately to patient ledger
    if (pendingFee > 0) {
      await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Doctor fee collected with bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: pendingFee, credit: 0, created_by: profile.id });
    }
    
    try {
      const netPharmacySales = Math.max(0, Number((total - tax).toFixed(2)));
      const effectiveTax = Math.max(0, Number((total - netPharmacySales).toFixed(2)));
      const journalLines: Array<{ ledger: string; debit?: number; credit?: number }> = [
        { ledger: "Patient Receivable", debit: Number((total + pendingFee).toFixed(2)) },
      ];
      if (netPharmacySales > 0) journalLines.push({ ledger: "Pharmacy Sales", credit: netPharmacySales });
      if (effectiveTax > 0) journalLines.push({ ledger: "GST Payable", credit: effectiveTax });
      if (pendingFee > 0) journalLines.push({ ledger: "Consultation Revenue", credit: Number(pendingFee.toFixed(2)) });
      await postJournal(profile, { voucherType: "inpatient_bill", entryDate: new Date().toISOString(), referenceType: "inpatient_bill", referenceId: sale.id, referenceNumber: invoice, narration: `Inpatient medicine bill ${invoice}`, lines: journalLines });
    } catch {}

    setSaving(false);
    setCart([]);
    setPatientId("");
    setPatientLabel("");
    setProductId("");
    setProduct(null);
    setRatePreview(null);
    setQty(1);
    setBalance(null);
    setPending([]);
    notify(`${invoice} added to inpatient ledger`);
  };

  return <div><PrintableInvoice organization={organization} patientName={patientLabel || ""} patientId={patientId} mobile={""} invoiceNo={""} date={""} cart={cart} medicine={medicine} tax={tax} specialDiscountAmount={specialDiscountAmount} total={total} pendingFee={0} title="INPATIENT BILLING" /><div className="no-print"><div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><h1>Inpatient Billing</h1><p>Credit billing charged to patient ledger.</p></div>
    <div className="print-hide" style={{ display: 'flex', gap: '10px' }}>
      <button className="secondary" onClick={() => triggerUniversalPrint()} style={{ minHeight: '38px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Print
      </button>
      <button className="secondary" onClick={() => { alert("In the print dialog, select 'Save as PDF' as your printer."); triggerUniversalPrint(); }} style={{ minHeight: '38px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        PDF Export
      </button>
    </div>
  </div><div className="panel billing-panel">
    <div className="billing-patient-line" style={{ marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: "240px" }}>
        <AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Inpatient" value={patientId} displayValue={patientLabel} onChange={(id, row) => { setPatientId(id); setPatientLabel(row ? patientText(row) : ""); }} render={patientText}/>
      </div>
      <QuickPatientModal profile={profile} notify={notify} onCreated={(row) => { setPatientId(row.id); setPatientLabel(patientText(row)); }} />
    </div>
    
    {patientId && balance !== null && <div className="auth-message" style={{ marginBottom: "16px", display: "flex", gap: "24px", flexWrap: "wrap", padding: "12px", borderRadius: "8px" }}>
      <span>Prev. ledger balance: <b style={{ color: balance + pendingFee > 0 ? "#c53030" : "#276749" }}>{money(balance + pendingFee)}</b></span>
      {cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + pendingFee + total)}</b></span>}
    </div>}
    
    <div className="billing-entry-line">
      <AsyncSelect table="products" select="id,product_id,name,gst_percent,mrp,selling_rate,purchase_rate,default_units_per_purchase_unit" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); setRatePreview(null); }} render={productText}/>
      <label className="field qty-field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label>
      <button type="button" className="primary" onClick={add}><Plus size={16}/> Add</button>
    </div>
    
    {ratePreview && <div className="auth-message stock-preview">Stock: <b style={{ color: Number(ratePreview.available_stock) <= 0 ? "#c53030" : undefined }}>{ratePreview.available_stock}{Number(ratePreview.available_stock) <= 0 ? " (Negative billing enabled)" : ""}</b> · Batch: <b>{ratePreview.batch_number}</b> · MRP rate: <b>{money(ratePreview.mrp_unit_rate)}</b> · Discount: <b>{Number(ratePreview.sales_discount_percent || 0)}%</b> · Final rate: <b>{money(ratePreview.final_rate)}</b> · GST: <b>{Number(ratePreview.gst_percent || 0)}% / {money(ratePreview.tax_each)}</b> · Billing rate: <b>{money(ratePreview.bill_rate)}</b></div>}
    
    {cart.length ? (
      <>
        {minDiscountThreshold > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: isDiscountEligible ? "#f0fdf4" : "#fffbeb",
              border: isDiscountEligible ? "1px solid #86efac" : "1px solid #fde68a",
              color: isDiscountEligible ? "#166534" : "#92400e",
            }}
          >
            {isDiscountEligible ? (
              <>
                <CheckCircle2 size={16} style={{ color: "#16a34a", flexShrink: 0 }} />
                <span>
                  Bill Total (MRP {money(rawBillTotal)}) qualifies for medicine discount (Min: {money(minDiscountThreshold)}).
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={16} style={{ color: "#d97706", flexShrink: 0 }} />
                <span>
                  Bill Total (MRP {money(rawBillTotal)}) is below minimum {money(minDiscountThreshold)} for discount. 0% discount applied to this bill.
                </span>
              </>
            )}
          </div>
        )}

        <div className="data-wrap">
          <table className="data-table billing-table">
            <thead>
              <tr>
                <th className="col-med">Medicine</th>
                <th className="col-qty" style={{ width: "90px" }}>Qty</th>
                <th className="col-rate" style={{ width: "110px" }}>Discount %</th>
                <th className="col-rate" style={{ width: "110px" }}>Final rate</th>
                <th className="col-total" style={{ width: "120px" }}>Total</th>
                <th className="col-action" style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, index) => (
                <tr key={`${item.batch_id}-${index}`} className="cart-row-interactive">
                  <td className="col-med"><strong>{item.name}</strong></td>
                  <td className="col-qty">
                    <input
                      className="table-qty-input"
                      type="number"
                      min="1"
                      step="1"
                      value={item.qty}
                      onChange={(event) => changeQty(index, event.currentTarget.value === "" ? "" : Number(event.currentTarget.value))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="col-rate">
                    <input
                      className="table-qty-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.sales_discount_percent ?? 0}
                      onChange={(event) => changeDiscount(index, event.currentTarget.value === "" ? "" : Number(event.currentTarget.value))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="col-rate">{money(item.selling_rate)}</td>
                  <td className="col-total"><strong>{money(Number(item.selling_rate) * Number(item.qty))}</strong></td>
                  <td className="col-action">
                    <button className="table-edit danger-btn" onClick={() => setCart((items) => applyBillDiscountRule(items.filter((_, i) => i !== index), minDiscountThreshold))} title="Remove item">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="checkout sales-checkout">
          <div className="discount-wrap">
            <label>Special Discount %</label>
            <input type="number" min="0" max="100" step="0.01" value={specialDiscountPercent} onChange={(e) => setSpecialDiscountPercent(Number(e.currentTarget.value))} />
          </div>
          <div className="totals-mini" style={{ alignItems: "center" }}>
            <span>Total <b>{money(total)}</b></span>
            {specialDiscountAmount > 0 && <span>Special disc. <b>-{money(specialDiscountAmount)}</b></span>}
            <strong
              className="billing-grand-total"
              style={{
                fontSize: "clamp(32px, 4vw, 44px)",
                fontWeight: 900,
                color: "#dc2626",
                textDecoration: "underline",
                textDecorationColor: "#dc2626",
                textUnderlineOffset: "6px",
                textDecorationThickness: "3px",
                display: "inline-flex",
                alignItems: "baseline",
                gap: "8px",
              }}
            >
              Bill total{" "}
              <b
                style={{
                  fontSize: "clamp(32px, 4vw, 44px)",
                  fontWeight: 900,
                  color: "#dc2626",
                  textDecoration: "underline",
                  textDecorationColor: "#dc2626",
                  textUnderlineOffset: "6px",
                  textDecorationThickness: "3px",
                  marginLeft: "6px",
                }}
              >
                {money(total)}
              </b>
            </strong>
          </div>
          <button className="primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Credit to patient</button>
        </div>
      </>
    )
    : <div className="empty"><h3>No medicines added.</h3><p>Select medicine and add quantity.</p></div>}
  </div></div></div>;
}


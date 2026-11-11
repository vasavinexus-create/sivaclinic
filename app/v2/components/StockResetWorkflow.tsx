"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import {
  getEffectiveStock,
  insertStockMovementSafe,
  normalizeBatchRow,
  updateBatchStock,
} from "../../../lib/inventory-stock";
import { postJournal } from "../lib/accounting";
import { fmtDate, money } from "../lib/format";
import { Organization, Profile, Row } from "../lib/types";
import { AsyncSelect } from "./controls";

type PhysicalEntry = {
  physicalUnits: string;
  sellingRate: string;
  purchaseRate: string;
  mrp: string;
};

type NewShelfBatchDraft = {
  tempId: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  expiry_date: string;
  physical_units: number;
  purchase_rate: number;
  selling_rate: number;
  mrp: number;
  gst_percent: number;
  purchase_unit: string;
  sale_unit: string;
  units_per_purchase_unit: number;
};

export function StockResetWorkflow({
  profile,
  organization,
  notify,
}: {
  profile: Profile;
  organization: Organization | null;
  notify: (message: string) => void;
}) {
  const [batches, setBatches] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "negative" | "zero" | "changed">("all");

  // Physical stock edits keyed by batch.id
  const [entries, setEntries] = useState<Record<string, PhysicalEntry>>({});

  // Newly discovered shelf batches that weren't in system yet (treated as Excess -> Purchase)
  const [newBatches, setNewBatches] = useState<NewShelfBatchDraft[]>([]);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [newMedId, setNewMedId] = useState("");
  const [newMedRow, setNewMedRow] = useState<Row | null>(null);
  const [newBatchNo, setNewBatchNo] = useState("");
  const [newExpiry, setNewExpiry] = useState(`${new Date().getFullYear() + 2}-12-31`);
  const [newPhysicalQty, setNewPhysicalQty] = useState(1);
  const [newMrp, setNewMrp] = useState(0);
  const [newPurchaseRate, setNewPurchaseRate] = useState(0);
  const [newSellingRate, setNewSellingRate] = useState(0);

  // Billing / Purchase options for difference settlement
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [shortagePaymentMode, setShortagePaymentMode] = useState<"cash" | "upi" | "card" | "bank">("cash");
  const [excessPaidMode, setExcessPaidMode] = useState<"paid_cash" | "credit_payable">("paid_cash");
  const [remarks, setRemarks] = useState("Physical stock verification & reset");
  const [lastResult, setLastResult] = useState<{
    shortageInvoice?: string;
    shortageTotal?: number;
    shortageUnits?: number;
    excessPurchaseNo?: string;
    excessTotal?: number;
    excessUnits?: number;
  } | null>(null);

  const settingDiscount = Number(organization?.sales_discount_percent || 0);

  const loadData = async () => {
    if (!supabase) return;
    setLoading(true);
    const [batchRes, supRes] = await Promise.all([
      supabase
        .from("medicine_batches")
        .select(
          "id,product_id,batch_number,expiry_date,supplier_id,quantity_received,current_stock,stock_unit_qty,purchase_rate,mrp,selling_rate,sales_discount_percent,gst_percent,purchase_unit,sale_unit,units_per_purchase_unit,rack_location,created_at,product:products(id,product_id,name,generic_name,purchase_unit,sale_unit,default_units_per_purchase_unit,mrp,selling_rate,purchase_rate,gst_percent),supplier:suppliers(id,name)"
        )
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("suppliers")
        .select("id,supplier_id,name")
        .eq("organization_id", profile.organization_id)
        .order("name", { ascending: true }),
    ]);

    const normalized = (batchRes.data || []).map((b: any) => normalizeBatchRow(b));
    setBatches(normalized);
    setSuppliers(supRes.data || []);
    if (supRes.data?.length && !selectedSupplierId) {
      setSelectedSupplierId(supRes.data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [profile.organization_id]);

  // Pre-fill new medicine rates when selected in "+ Add Medicine Batch"
  useEffect(() => {
    if (!newMedRow) return;
    const units = Math.max(1, Number(newMedRow.default_units_per_purchase_unit || 1));
    const mrpVal = Number(newMedRow.mrp || 0);
    const sellVal =
      Number(newMedRow.selling_rate || 0) > 0
        ? Number(newMedRow.selling_rate)
        : Number(((mrpVal / units) * (1 - settingDiscount / 100)).toFixed(2));
    const purVal =
      Number(newMedRow.purchase_rate || 0) > 0
        ? Number(newMedRow.purchase_rate)
        : Number((sellVal * 0.8).toFixed(2));
    setNewMrp(mrpVal);
    setNewSellingRate(sellVal);
    setNewPurchaseRate(purVal);
  }, [newMedRow, settingDiscount]);

  const updatePhysicalEntry = (batch: Row, field: keyof PhysicalEntry, value: string) => {
    setEntries((prev) => {
      const existing = prev[batch.id] || {
        physicalUnits: "",
        sellingRate: String(Number(batch.selling_rate || batch.mrp || 0)),
        purchaseRate: String(Number(batch.purchase_rate || 0)),
        mrp: String(Number(batch.mrp || 0)),
      };
      return {
        ...prev,
        [batch.id]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const clearEntry = (batchId: string) => {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  const resetAllEntries = () => {
    setEntries({});
    setNewBatches([]);
  };

  const addNewShelfBatch = () => {
    if (!newMedId || !newMedRow) {
      notify("Select a medicine first");
      return;
    }
    if (!newBatchNo.trim()) {
      notify("Enter batch number");
      return;
    }
    if (Number(newPhysicalQty) <= 0) {
      notify("Physical stock for a new batch must be greater than 0");
      return;
    }

    const units = Math.max(1, Number(newMedRow.default_units_per_purchase_unit || 1));
    setNewBatches((prev) => [
      ...prev,
      {
        tempId: `NEW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        product_id: newMedId,
        product_name: newMedRow.name,
        batch_number: newBatchNo.trim(),
        expiry_date: newExpiry || `${new Date().getFullYear() + 2}-12-31`,
        physical_units: Number(newPhysicalQty),
        purchase_rate: Number(newPurchaseRate || 0),
        selling_rate: Number(newSellingRate || newMrp || 0),
        mrp: Number(newMrp || newSellingRate || 0),
        gst_percent: Number(newMedRow.gst_percent || 0),
        purchase_unit: newMedRow.purchase_unit || "strip",
        sale_unit: newMedRow.sale_unit || "tablet",
        units_per_purchase_unit: units,
      },
    ]);

    setNewBatchNo("");
    setNewPhysicalQty(1);
    setShowAddBatch(false);
  };

  // Filtered batches for table display
  const filteredBatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter((b) => {
      const sysStock = getEffectiveStock(b);
      const entry = entries[b.id];
      const hasChange =
        entry !== undefined &&
        entry.physicalUnits.trim() !== "" &&
        Number(entry.physicalUnits) !== sysStock;

      if (stockFilter === "negative" && sysStock >= 0) return false;
      if (stockFilter === "zero" && sysStock !== 0) return false;
      if (stockFilter === "changed" && !hasChange) return false;

      if (!q) return true;
      const medName = String(b.product?.name || "").toLowerCase();
      const medCode = String(b.product?.product_id || "").toLowerCase();
      const generic = String(b.product?.generic_name || "").toLowerCase();
      const batchNo = String(b.batch_number || "").toLowerCase();
      return (
        medName.includes(q) ||
        medCode.includes(q) ||
        generic.includes(q) ||
        batchNo.includes(q)
      );
    });
  }, [batches, search, stockFilter, entries]);

  // Compute all active adjustments (Shortage vs Excess)
  const adjustmentSummary = useMemo(() => {
    const shortageItems: Array<{
      batch: Row;
      systemStock: number;
      physicalStock: number;
      shortageQty: number;
      sellingRate: number;
      mrp: number;
      gstPercent: number;
      lineTotal: number;
    }> = [];

    const excessItems: Array<{
      batch?: Row;
      newBatch?: NewShelfBatchDraft;
      systemStock: number;
      physicalStock: number;
      excessQty: number;
      purchaseRate: number;
      sellingRate: number;
      mrp: number;
      gstPercent: number;
      lineTotal: number;
    }> = [];

    for (const b of batches) {
      const entry = entries[b.id];
      if (!entry || entry.physicalUnits.trim() === "") continue;
      const physicalStock = Number(entry.physicalUnits);
      if (Number.isNaN(physicalStock)) continue;

      const systemStock = getEffectiveStock(b);
      const diff = physicalStock - systemStock;
      if (diff === 0) continue;

      const sellingRate = Math.max(0, Number(entry.sellingRate ?? b.selling_rate ?? b.mrp ?? 0));
      const purchaseRate = Math.max(0, Number(entry.purchaseRate ?? b.purchase_rate ?? 0));
      const mrp = Math.max(0, Number(entry.mrp ?? b.mrp ?? sellingRate));
      const gstPercent = Number(b.gst_percent ?? b.product?.gst_percent ?? 0);

      if (diff < 0) {
        // Physical stock is LESS than System stock -> SHORTAGE (Needs to be Billed as Sale)
        const shortageQty = Math.abs(diff);
        shortageItems.push({
          batch: b,
          systemStock,
          physicalStock,
          shortageQty,
          sellingRate,
          mrp,
          gstPercent,
          lineTotal: Number((shortageQty * sellingRate).toFixed(2)),
        });
      } else if (diff > 0) {
        // Physical stock is MORE than System stock -> EXCESS (Needs to be entered as Purchase)
        const excessQty = diff;
        excessItems.push({
          batch: b,
          systemStock,
          physicalStock,
          excessQty,
          purchaseRate,
          sellingRate,
          mrp,
          gstPercent,
          lineTotal: Number((excessQty * purchaseRate).toFixed(2)),
        });
      }
    }

    for (const nb of newBatches) {
      excessItems.push({
        newBatch: nb,
        systemStock: 0,
        physicalStock: nb.physical_units,
        excessQty: nb.physical_units,
        purchaseRate: nb.purchase_rate,
        sellingRate: nb.selling_rate,
        mrp: nb.mrp,
        gstPercent: nb.gst_percent,
        lineTotal: Number((nb.physical_units * nb.purchase_rate).toFixed(2)),
      });
    }

    const shortageTotalUnits = shortageItems.reduce((s, i) => s + i.shortageQty, 0);
    const shortageTotalValue = shortageItems.reduce((s, i) => s + i.lineTotal, 0);
    const excessTotalUnits = excessItems.reduce((s, i) => s + i.excessQty, 0);
    const excessTotalValue = excessItems.reduce((s, i) => s + i.lineTotal, 0);

    return {
      shortageItems,
      excessItems,
      shortageTotalUnits,
      shortageTotalValue,
      excessTotalUnits,
      excessTotalValue,
      totalChangedCount: shortageItems.length + excessItems.length,
    };
  }, [batches, entries, newBatches]);

  // Ensure a supplier exists when recording Excess Purchase
  const resolveSupplierForExcess = async (): Promise<string> => {
    if (selectedSupplierId) return selectedSupplierId;
    if (suppliers.length > 0) return suppliers[0].id;

    // Create a default Stock Verification Supplier if organization has no suppliers yet
    const supRes = await supabase!
      .from("suppliers")
      .insert({
        organization_id: profile.organization_id,
        supplier_id: "SUP-STOCK-ADJ",
        name: "PHYSICAL STOCK VERIFICATION (EXCESS)",
        credit_period_days: 0,
        active: true,
      })
      .select("id")
      .single();
    const createdSup = supRes?.data;
    const supErr = supRes?.error;

    if (supErr || !createdSup) {
      throw new Error(supErr?.message || "Could not resolve supplier for excess stock purchase");
    }
    return createdSup.id;
  };

  const applyStockReset = async () => {
    if (!supabase) return;
    const { shortageItems, excessItems } = adjustmentSummary;
    if (shortageItems.length === 0 && excessItems.length === 0) {
      notify("Enter physical stock for at least one batch where stock differs from system stock");
      return;
    }

    setSaving(true);
    setLastResult(null);

    try {
      const todayIso = new Date().toISOString();
      const todayDate = todayIso.slice(0, 10);
      let generatedShortageInvoice: string | undefined;
      let generatedExcessPurchaseNo: string | undefined;

      // ─────────────────────────────────────────────────────────────────────────
      // 1. PROCESS SHORTAGE ITEMS -> GENERATE SALE BILL & SET STOCK TO PHYSICAL
      // ─────────────────────────────────────────────────────────────────────────
      if (shortageItems.length > 0) {
        const salesGstMode = organization?.sales_gst_mode || "price_plus_gst";
        const isPriceOnly = salesGstMode === "price_only";

        const medicineSubtotal = shortageItems.reduce(
          (sum, item) =>
            sum +
            (isPriceOnly
              ? item.lineTotal
              : item.lineTotal / (1 + Number(item.gstPercent || 0) / 100)),
          0
        );
        const medicineTax = shortageItems.reduce(
          (sum, item) =>
            sum +
            (isPriceOnly
              ? (item.lineTotal * Number(item.gstPercent || 0)) / 100
              : item.lineTotal - item.lineTotal / (1 + Number(item.gstPercent || 0) / 100)),
          0
        );
        const grossTotal = isPriceOnly
          ? medicineSubtotal + medicineTax
          : shortageItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const grandTotal = Math.max(0, Number(grossTotal.toFixed(2)));

        generatedShortageInvoice = `SR-SALE-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

        const { data: sale, error: saleErr } = await supabase
          .from("sales")
          .insert({
            organization_id: profile.organization_id,
            invoice_no: generatedShortageInvoice,
            patient_id: null,
            medicine_subtotal: Number(medicineSubtotal.toFixed(2)),
            medicine_tax: Number(medicineTax.toFixed(2)),
            pharmacy_revenue: grandTotal,
            doctor_fee: 0,
            gross_total: grandTotal,
            special_discount_percent: 0,
            special_discount_amount: 0,
            grand_total: grandTotal,
            payment_mode: shortagePaymentMode,
            sale_type: "outpatient",
            has_rate_edit: false,
            rate_edit_verified: true,
            status: "completed",
            created_by: profile.id,
          })
          .select("id")
          .single();

        if (saleErr || !sale) {
          throw new Error(saleErr?.message || "Failed to create shortage sale bill");
        }

        for (const sItem of shortageItems) {
          const { batch, shortageQty, physicalStock, sellingRate, mrp, gstPercent, lineTotal } = sItem;

          const { error: siErr } = await supabase.from("sale_items").insert({
            organization_id: profile.organization_id,
            sale_id: sale.id,
            product_id: batch.product_id,
            batch_id: batch.id,
            quantity: shortageQty,
            unit_rate: sellingRate,
            original_unit_rate: Number(batch.selling_rate || sellingRate),
            rate_edited: Number(batch.selling_rate || 0) !== sellingRate,
            mrp,
            mrp_unit_rate: mrp,
            original_sales_discount_percent: Number(batch.sales_discount_percent || 0),
            sales_discount_percent: Number(batch.sales_discount_percent || 0),
            gst_percent: gstPercent,
            line_total: lineTotal,
          });
          if (siErr) throw siErr;

          // Update batch stock to match verified physical stock
          await updateBatchStock(supabase, batch.id, physicalStock, {
            selling_rate: sellingRate,
            mrp,
          });

          // Record stock movement for shortage sale
          await insertStockMovementSafe(supabase, {
            organization_id: profile.organization_id,
            product_id: batch.product_id,
            batch_id: batch.id,
            movement_type: "sale",
            reference_type: "stock_reset_shortage",
            reference_id: sale.id,
            reference_number: generatedShortageInvoice,
            out_quantity: shortageQty,
            balance_quantity: physicalStock,
            created_by: profile.id,
          });
        }

        if (grandTotal > 0) {
          await supabase.from("cash_ledger").insert({
            organization_id: profile.organization_id,
            occurred_at: todayIso,
            entry_type: "receipt",
            category: "Stock Shortage Bill",
            reference_type: "sale",
            reference_id: sale.id,
            amount: grandTotal,
            payment_mode: shortagePaymentMode,
            created_by: profile.id,
          });

          try {
            const netShortageSales = Math.max(0, Number((grandTotal - medicineTax).toFixed(2)));
            const effectiveShortageTax = Math.max(0, Number((grandTotal - netShortageSales).toFixed(2)));
            const shortageLines: Array<{ ledger: string; debit?: number; credit?: number }> = [
              { ledger: shortagePaymentMode === "cash" ? "Cash" : "Bank", debit: grandTotal },
            ];
            if (netShortageSales > 0) shortageLines.push({ ledger: "Pharmacy Sales", credit: netShortageSales });
            if (effectiveShortageTax > 0) shortageLines.push({ ledger: "GST Payable", credit: effectiveShortageTax });
            await postJournal(profile, {
              voucherType: "sale",
              entryDate: todayIso,
              referenceType: "sale",
              referenceId: sale.id,
              referenceNumber: generatedShortageInvoice,
              narration: `Stock Reset Shortage Bill ${generatedShortageInvoice} (${remarks})`,
              lines: shortageLines,
            });
          } catch {}
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 2. PROCESS EXCESS ITEMS -> GENERATE PURCHASE BILL & SET STOCK TO PHYSICAL
      // ─────────────────────────────────────────────────────────────────────────
      if (excessItems.length > 0) {
        const supplierId = await resolveSupplierForExcess();

        let subtotal = 0;
        let taxAmount = 0;
        for (const eItem of excessItems) {
          const gst = Number(eItem.gstPercent || 0);
          const lineSub = eItem.lineTotal / (1 + gst / 100);
          subtotal += lineSub;
          taxAmount += eItem.lineTotal - lineSub;
        }
        const invoiceTotal = Math.max(0, Number((subtotal + taxAmount).toFixed(2)));
        const amountPaid = excessPaidMode === "paid_cash" ? invoiceTotal : 0;

        generatedExcessPurchaseNo = `SR-PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

        const { data: purchase, error: purErr } = await supabase
          .from("purchases")
          .insert({
            organization_id: profile.organization_id,
            purchase_no: generatedExcessPurchaseNo,
            supplier_id: supplierId,
            supplier_invoice_no: generatedExcessPurchaseNo,
            invoice_date: todayDate,
            subtotal: Number(subtotal.toFixed(2)),
            tax_total: Number(taxAmount.toFixed(2)),
            invoice_total: invoiceTotal,
            amount_paid: amountPaid,
            status: "completed",
            created_by: profile.id,
          })
          .select("id")
          .single();

        if (purErr || !purchase) {
          throw new Error(purErr?.message || "Failed to create excess stock purchase bill");
        }

        for (const eItem of excessItems) {
          if (eItem.batch) {
            const b = eItem.batch;
            const unitsPerPack = Math.max(
              1,
              Number(b.units_per_purchase_unit || b.product?.default_units_per_purchase_unit || 1)
            );
            const excessPacks = Number((eItem.excessQty / unitsPerPack).toFixed(3));

            await updateBatchStock(supabase, b.id, eItem.physicalStock, {
              quantity_received: Number(b.quantity_received || 0) + eItem.excessQty,
              purchase_rate: eItem.purchaseRate,
              selling_rate: eItem.sellingRate,
              mrp: eItem.mrp,
              supplier_id: b.supplier_id || supplierId,
              purchase_id: purchase.id,
            });

            const { error: piErr } = await supabase.from("purchase_items").insert({
              organization_id: profile.organization_id,
              purchase_id: purchase.id,
              product_id: b.product_id,
              batch_id: b.id,
              quantity: eItem.excessQty,
              free_quantity: 0,
              rate: eItem.purchaseRate,
              gst_percent: eItem.gstPercent,
              discount: 0,
              line_total: eItem.lineTotal,
              purchase_unit: b.purchase_unit || b.product?.purchase_unit || "unit",
              sale_unit: b.sale_unit || b.product?.sale_unit || "unit",
              units_per_purchase_unit: unitsPerPack,
              purchase_pack_qty: excessPacks,
              free_pack_qty: 0,
              stock_unit_qty: eItem.excessQty,
              purchase_rate_per_unit: eItem.purchaseRate,
            });
            if (piErr) throw piErr;

            await insertStockMovementSafe(supabase, {
              organization_id: profile.organization_id,
              product_id: b.product_id,
              batch_id: b.id,
              movement_type: "purchase",
              reference_type: "stock_reset_excess",
              reference_id: purchase.id,
              reference_number: generatedExcessPurchaseNo,
              in_quantity: eItem.excessQty,
              balance_quantity: eItem.physicalStock,
              created_by: profile.id,
            });
          } else if (eItem.newBatch) {
            const nb = eItem.newBatch;
            const unitsPerPack = Math.max(1, Number(nb.units_per_purchase_unit || 1));
            const packQty = Number((nb.physical_units / unitsPerPack).toFixed(3));

            const { data: createdBatch, error: cbErr } = await supabase
              .from("medicine_batches")
              .insert({
                organization_id: profile.organization_id,
                product_id: nb.product_id,
                batch_number: nb.batch_number,
                expiry_date: nb.expiry_date,
                supplier_id: supplierId,
                purchase_id: purchase.id,
                quantity_received: nb.physical_units,
                free_quantity: 0,
                current_stock: nb.physical_units,
                stock_unit_qty: nb.physical_units,
                purchase_rate: nb.purchase_rate,
                mrp: nb.mrp,
                selling_rate: nb.selling_rate,
                gst_percent: nb.gst_percent,
                purchase_unit: nb.purchase_unit,
                sale_unit: nb.sale_unit,
                units_per_purchase_unit: unitsPerPack,
                purchase_pack_qty: packQty,
                free_pack_qty: 0,
              })
              .select("id")
              .single();

            if (cbErr || !createdBatch) {
              throw new Error(cbErr?.message || `Failed to create batch ${nb.batch_number}`);
            }

            const { error: piErr } = await supabase.from("purchase_items").insert({
              organization_id: profile.organization_id,
              purchase_id: purchase.id,
              product_id: nb.product_id,
              batch_id: createdBatch.id,
              quantity: nb.physical_units,
              free_quantity: 0,
              rate: nb.purchase_rate,
              gst_percent: nb.gst_percent,
              discount: 0,
              line_total: eItem.lineTotal,
              purchase_unit: nb.purchase_unit,
              sale_unit: nb.sale_unit,
              units_per_purchase_unit: unitsPerPack,
              purchase_pack_qty: packQty,
              free_pack_qty: 0,
              stock_unit_qty: nb.physical_units,
              purchase_rate_per_unit: nb.purchase_rate,
            });
            if (piErr) throw piErr;

            await insertStockMovementSafe(supabase, {
              organization_id: profile.organization_id,
              product_id: nb.product_id,
              batch_id: createdBatch.id,
              movement_type: "purchase",
              reference_type: "stock_reset_excess",
              reference_id: purchase.id,
              reference_number: generatedExcessPurchaseNo,
              in_quantity: nb.physical_units,
              balance_quantity: nb.physical_units,
              created_by: profile.id,
            });
          }
        }

        await supabase.from("supplier_ledger").insert({
          organization_id: profile.organization_id,
          supplier_id: supplierId,
          occurred_on: todayDate,
          particulars: `Stock Reset Excess Purchase ${generatedExcessPurchaseNo} (${remarks})`,
          reference_type: "purchase",
          reference_id: purchase.id,
          reference_number: generatedExcessPurchaseNo,
          debit: invoiceTotal,
          credit: amountPaid,
          created_by: profile.id,
        });

        if (amountPaid > 0) {
          await supabase.from("cash_ledger").insert({
            organization_id: profile.organization_id,
            occurred_at: todayIso,
            entry_type: "payment",
            category: "Stock Excess Purchase",
            reference_type: "purchase",
            reference_id: purchase.id,
            amount: amountPaid,
            payment_mode: "cash",
            created_by: profile.id,
          });
        }

        if (invoiceTotal > 0) {
          try {
            await postJournal(profile, {
              voucherType: "purchase",
              entryDate: todayDate,
              referenceType: "purchase",
              referenceId: purchase.id,
              referenceNumber: generatedExcessPurchaseNo,
              narration: `Stock Reset Excess Purchase ${generatedExcessPurchaseNo} (${remarks})`,
              lines: [
                { ledger: "Purchase", debit: invoiceTotal },
                { ledger: "Supplier Payable", credit: invoiceTotal },
              ],
            });
            if (amountPaid > 0) {
              await postJournal(profile, {
                voucherType: "payment",
                entryDate: todayDate,
                referenceType: "purchase",
                referenceId: purchase.id,
                referenceNumber: generatedExcessPurchaseNo,
                narration: `Stock Reset Excess Adjustment Settlement ${generatedExcessPurchaseNo}`,
                lines: [
                  { ledger: "Supplier Payable", debit: amountPaid },
                  { ledger: "Cash", credit: amountPaid },
                ],
              });
            }
          } catch {}
        }
      }

      setLastResult({
        shortageInvoice: generatedShortageInvoice,
        shortageTotal: adjustmentSummary.shortageTotalValue,
        shortageUnits: adjustmentSummary.shortageTotalUnits,
        excessPurchaseNo: generatedExcessPurchaseNo,
        excessTotal: adjustmentSummary.excessTotalValue,
        excessUnits: adjustmentSummary.excessTotalUnits,
      });

      resetAllEntries();
      await loadData();

      const parts: string[] = [];
      if (generatedShortageInvoice) parts.push(`Shortage billed: ${generatedShortageInvoice}`);
      if (generatedExcessPurchaseNo) parts.push(`Excess purchased: ${generatedExcessPurchaseNo}`);
      notify(`Physical stock reset complete (${parts.join(" · ")})`);
    } catch (err: any) {
      notify(err.message || "Failed to apply stock reset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1>Physical Stock Reset & Reconciliation</h1>
          <p>
            Enter verified physical stock in shop. Shortages (Physical &lt; System) are automatically{" "}
            <strong>billed as a Sale</strong>, and Excesses (Physical &gt; System) are automatically{" "}
            <strong>entered as a Purchase</strong>.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowAddBatch((v) => !v)}
          >
            <Plus size={16} /> Add Unlisted Batch (Excess)
          </button>
          <button
            type="button"
            className="secondary"
            onClick={resetAllEntries}
            disabled={adjustmentSummary.totalChangedCount === 0}
          >
            <RotateCcw size={16} /> Clear Edits
          </button>
          <button type="button" className="secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Completion Banner */}
      {lastResult && (
        <div
          className="panel"
          style={{
            marginBottom: "18px",
            padding: "16px 20px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <strong style={{ color: "#166534", fontSize: "15px", display: "block", marginBottom: "4px" }}>
              Stock Reset Completed Successfully
            </strong>
            <div style={{ fontSize: "13px", color: "#15803d", display: "flex", gap: "18px", flexWrap: "wrap" }}>
              {lastResult.shortageInvoice && (
                <span>
                  Shortage Sale Bill: <b>{lastResult.shortageInvoice}</b> ({lastResult.shortageUnits} units ·{" "}
                  <b>{money(lastResult.shortageTotal || 0)}</b>)
                </span>
              )}
              {lastResult.excessPurchaseNo && (
                <span>
                  Excess Purchase Bill: <b>{lastResult.excessPurchaseNo}</b> ({lastResult.excessUnits} units ·{" "}
                  <b>{money(lastResult.excessTotal || 0)}</b>)
                </span>
              )}
            </div>
          </div>
          <button className="secondary" onClick={() => setLastResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Optional: Add Unlisted Shelf Batch (treated as Excess -> Purchase) */}
      {showAddBatch && (
        <div className="panel" style={{ marginBottom: "18px", padding: "18px", border: "1px solid #cbd5e1" }}>
          <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
            Add Found Physical Batch (Not Yet in System → Excess Purchase)
          </h3>
          <div className="grid-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", alignItems: "end" }}>
            <div style={{ gridColumn: "span 2" }}>
              <AsyncSelect
                table="products"
                select="id,product_id,name,gst_percent,mrp,selling_rate,purchase_rate,purchase_unit,sale_unit,default_units_per_purchase_unit"
                searchColumns={["product_id", "name", "barcode", "generic_name"]}
                label="Medicine"
                value={newMedId}
                onChange={(id, row) => {
                  setNewMedId(id);
                  setNewMedRow(row || null);
                }}
                render={(r) => `${r.product_id || ""} · ${r.name}`}
              />
            </div>
            <label className="field">
              <span>Batch Number</span>
              <input
                value={newBatchNo}
                onChange={(e) => setNewBatchNo(e.currentTarget.value)}
                placeholder="e.g. B2026"
              />
            </label>
            <label className="field">
              <span>Expiry Date</span>
              <input
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.currentTarget.value)}
              />
            </label>
            <label className="field">
              <span>Physical Units Counted</span>
              <input
                type="number"
                min="1"
                step="1"
                value={newPhysicalQty}
                onChange={(e) => setNewPhysicalQty(Number(e.currentTarget.value))}
              />
            </label>
            <label className="field">
              <span>Purchase Rate / Unit</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPurchaseRate}
                onChange={(e) => setNewPurchaseRate(Number(e.currentTarget.value))}
              />
            </label>
            <label className="field">
              <span>Selling Rate / Unit</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newSellingRate}
                onChange={(e) => setNewSellingRate(Number(e.currentTarget.value))}
              />
            </label>
            <label className="field">
              <span>MRP / Unit</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newMrp}
                onChange={(e) => setNewMrp(Number(e.currentTarget.value))}
              />
            </label>
            <button type="button" className="primary" onClick={addNewShelfBatch}>
              <Plus size={16} /> Add to Reset List
            </button>
          </div>
        </div>
      )}

      {/* Newly Added Shelf Batches Preview */}
      {newBatches.length > 0 && (
        <div className="panel" style={{ marginBottom: "18px", padding: "16px" }}>
          <h4 style={{ margin: "0 0 10px 0" }}>New Shelf Batches to Add as Excess Purchase ({newBatches.length})</h4>
          <div className="data-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Physical Stock</th>
                  <th>Excess (+Purchase)</th>
                  <th>Purchase Rate/Unit</th>
                  <th>Excess Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {newBatches.map((nb) => (
                  <tr key={nb.tempId}>
                    <td><strong>{nb.product_name}</strong></td>
                    <td>{nb.batch_number}</td>
                    <td>{fmtDate(nb.expiry_date)}</td>
                    <td><b>{nb.physical_units}</b></td>
                    <td style={{ color: "#15803d", fontWeight: 700 }}>+{nb.physical_units} (EXCESS)</td>
                    <td>{money(nb.purchase_rate)}</td>
                    <td><strong>{money(nb.physical_units * nb.purchase_rate)}</strong></td>
                    <td>
                      <button
                        type="button"
                        className="table-edit danger-btn"
                        onClick={() => setNewBatches((list) => list.filter((x) => x.tempId !== nb.tempId))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary & Action Panel */}
      <div
        className="panel"
        style={{
          marginBottom: "18px",
          padding: "18px",
          background: adjustmentSummary.totalChangedCount > 0 ? "#f8fafc" : undefined,
          border: adjustmentSummary.totalChangedCount > 0 ? "2px solid #0f766e" : undefined,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              padding: "14px",
              borderRadius: "8px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b91c1c", fontWeight: 700 }}>
              <ShoppingCart size={17} /> SHORTAGE (Physical &lt; System → Billed)
            </div>
            <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 800, color: "#991b1b" }}>
              {money(adjustmentSummary.shortageTotalValue)}
            </div>
            <div style={{ fontSize: "12px", color: "#7f1d1d" }}>
              {adjustmentSummary.shortageItems.length} batches · {adjustmentSummary.shortageTotalUnits} shortage units
            </div>
          </div>

          <div
            style={{
              padding: "14px",
              borderRadius: "8px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#15803d", fontWeight: 700 }}>
              <PackagePlus size={17} /> EXCESS (Physical &gt; System → Purchase)
            </div>
            <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 800, color: "#166534" }}>
              {money(adjustmentSummary.excessTotalValue)}
            </div>
            <div style={{ fontSize: "12px", color: "#14532d" }}>
              {adjustmentSummary.excessItems.length} batches · +{adjustmentSummary.excessTotalUnits} excess units
            </div>
          </div>

          <label className="field" style={{ margin: 0 }}>
            <span>Supplier (for Excess Purchase)</span>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.currentTarget.value)}
            >
              <option value="">Auto / Default Adjustment Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.supplier_id})
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Shortage Bill Payment Mode</span>
            <select
              value={shortagePaymentMode}
              onChange={(e) => setShortagePaymentMode(e.currentTarget.value as any)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Excess Purchase Settlement</span>
            <select
              value={excessPaidMode}
              onChange={(e) => setExcessPaidMode(e.currentTarget.value as any)}
            >
              <option value="paid_cash">Paid / Adjusted Immediately</option>
              <option value="credit_payable">Credit (Supplier Payable)</option>
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Verification Remarks</span>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.currentTarget.value)}
              placeholder="Reason / note"
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <span style={{ fontSize: "13px", color: "#475569" }}>
            {adjustmentSummary.totalChangedCount === 0
              ? "Enter physical stock counts in the table below to calculate Shortage (Sale Bill) or Excess (Purchase Bill)."
              : `Ready to reset ${adjustmentSummary.totalChangedCount} batch(es): ${adjustmentSummary.shortageItems.length} shortage(s) to bill and ${adjustmentSummary.excessItems.length} excess(es) to purchase.`}
          </span>
          <button
            type="button"
            className="primary"
            onClick={applyStockReset}
            disabled={saving || adjustmentSummary.totalChangedCount === 0}
          >
            {saving ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}{" "}
            Apply Stock Reset (Bill Shortage &amp; Purchase Excess)
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="panel" style={{ padding: "16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <div className="search-box" style={{ flex: "1 1 280px", maxWidth: "420px" }}>
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search medicine name, code, generic, or batch..."
            />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {(
              [
                ["all", `All Batches (${batches.length})`],
                ["negative", `Negative Stock (${batches.filter((b) => getEffectiveStock(b) < 0).length})`],
                ["zero", `Zero Stock (${batches.filter((b) => getEffectiveStock(b) === 0).length})`],
                ["changed", `Edited Rows (${adjustmentSummary.totalChangedCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={stockFilter === key ? "primary" : "secondary"}
                onClick={() => setStockFilter(key)}
                style={{ minHeight: "34px", padding: "6px 12px", fontSize: "13px" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty">
            <LoaderCircle className="spin" />
            <p>Loading medicine batches...</p>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="empty">
            <h3>No medicine batches match your filter.</h3>
            <p>Try clearing the search or click &ldquo;Add Unlisted Batch&rdquo; above.</p>
          </div>
        ) : (
          <div className="data-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch / Expiry</th>
                  <th>System Stock</th>
                  <th>Physical Stock (Counted)</th>
                  <th>Difference</th>
                  <th>Action Type</th>
                  <th>Rate / Unit</th>
                  <th>Diff Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((b) => {
                  const sysStock = getEffectiveStock(b);
                  const entry = entries[b.id];
                  const hasInput = entry !== undefined && entry.physicalUnits.trim() !== "";
                  const physicalStock = hasInput ? Number(entry.physicalUnits) : sysStock;
                  const diff = hasInput && !Number.isNaN(physicalStock) ? physicalStock - sysStock : 0;

                  const isShortage = diff < 0;
                  const isExcess = diff > 0;

                  const sellingRate = Number(entry?.sellingRate ?? b.selling_rate ?? b.mrp ?? 0);
                  const purchaseRate = Number(entry?.purchaseRate ?? b.purchase_rate ?? 0);
                  const activeRate = isShortage ? sellingRate : isExcess ? purchaseRate : sellingRate;
                  const diffValue = isShortage
                    ? Math.abs(diff) * sellingRate
                    : isExcess
                    ? diff * purchaseRate
                    : 0;

                  return (
                    <tr
                      key={b.id}
                      style={{
                        background: isShortage
                          ? "#fff5f5"
                          : isExcess
                          ? "#f0fdf4"
                          : undefined,
                      }}
                    >
                      <td>
                        <strong>{b.product?.name || "Unknown Medicine"}</strong>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {b.product?.product_id} · {b.product?.default_units_per_purchase_unit || 1}{" "}
                          {b.product?.sale_unit || "unit"}/{b.product?.purchase_unit || "pack"}
                        </div>
                      </td>
                      <td>
                        <div><b>{b.batch_number}</b></div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          Exp: {fmtDate(b.expiry_date)}
                        </div>
                      </td>
                      <td>
                        <strong
                          style={{
                            color: sysStock < 0 ? "#dc2626" : sysStock === 0 ? "#d97706" : "#0f172a",
                            fontSize: "14px",
                          }}
                        >
                          {sysStock} {sysStock < 0 ? "(Neg)" : ""}
                        </strong>
                      </td>
                      <td>
                        <input
                          className="table-qty-input"
                          type="number"
                          step="1"
                          placeholder={String(sysStock)}
                          value={entry?.physicalUnits ?? ""}
                          onChange={(e) => updatePhysicalEntry(b, "physicalUnits", e.currentTarget.value)}
                          style={{
                            width: "95px",
                            fontWeight: 700,
                            border: hasInput && diff !== 0 ? "2px solid #0f766e" : undefined,
                          }}
                        />
                      </td>
                      <td>
                        {!hasInput || diff === 0 ? (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        ) : (
                          <strong style={{ color: isShortage ? "#dc2626" : "#16a34a" }}>
                            {diff > 0 ? `+${diff}` : diff} units
                          </strong>
                        )}
                      </td>
                      <td>
                        {!hasInput || diff === 0 ? (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>No change</span>
                        ) : isShortage ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 8px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: "#fee2e2",
                              color: "#b91c1c",
                            }}
                          >
                            SHORTAGE → BILL ({Math.abs(diff)})
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 8px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: "#dcfce7",
                              color: "#15803d",
                            }}
                          >
                            EXCESS → PURCHASE (+{diff})
                          </span>
                        )}
                      </td>
                      <td>
                        {isShortage ? (
                          <div>
                            <input
                              className="table-qty-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry?.sellingRate ?? String(Number(b.selling_rate || b.mrp || 0))}
                              onChange={(e) => updatePhysicalEntry(b, "sellingRate", e.currentTarget.value)}
                              style={{ width: "85px" }}
                            />
                            <div style={{ fontSize: "10px", color: "#64748b" }}>Sale rate</div>
                          </div>
                        ) : isExcess ? (
                          <div>
                            <input
                              className="table-qty-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry?.purchaseRate ?? String(Number(b.purchase_rate || 0))}
                              onChange={(e) => updatePhysicalEntry(b, "purchaseRate", e.currentTarget.value)}
                              style={{ width: "85px" }}
                            />
                            <div style={{ fontSize: "10px", color: "#64748b" }}>Purchase rate</div>
                          </div>
                        ) : (
                          <span style={{ color: "#64748b", fontSize: "12px" }}>
                            Sale: {money(activeRate)} / Pur: {money(purchaseRate)}
                          </span>
                        )}
                      </td>
                      <td>
                        {!hasInput || diff === 0 ? (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        ) : (
                          <strong style={{ color: isShortage ? "#b91c1c" : "#15803d" }}>
                            {money(diffValue)}
                          </strong>
                        )}
                      </td>
                      <td>
                        {hasInput && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => clearEntry(b.id)}
                            title="Clear row edit"
                            style={{ minHeight: "28px", padding: "4px 8px", fontSize: "11px" }}
                          >
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

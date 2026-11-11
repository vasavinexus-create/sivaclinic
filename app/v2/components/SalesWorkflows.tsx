"use client";

import { useEffect, useState } from "react";
import { mutate as globalMutate } from "swr";
import { Eye, Printer, RotateCcw, Trash2, X, RotateCw, Pencil, Plus, CheckCircle2, LoaderCircle, AlertCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { canDeleteBill, cancelBill } from "../../../lib/bill-cancellation";
import {
  getEffectiveStock,
  insertStockMovementSafe,
  updateBatchStock,
  resolveBillingBatchesForProduct,
  discountedSaleRate,
} from "../../../lib/inventory-stock";
import { postJournal } from "../lib/accounting";
import { getBillingDiscountConfig, parseSalesGstMode, Organization, Profile, Row } from "../lib/types";
import { AsyncSelect } from "./controls";
import { PrintableInvoice } from "./PharmacyWorkflows";

const getTodayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

function productText(row: Row) {
  const details: string[] = [];
  if (row.category) details.push(String(row.category));
  if (row.box_number) details.push(`Box #${row.box_number}`);
  if (row.generic_name) details.push(String(row.generic_name));
  return `${row.name || ""}${details.length > 0 ? ` (${details.join(" • ")})` : ""}`;
}

export function SalesWorkflow({
  profile,
  organization,
  notify,
  todayOnly = false,
  hideHeader = false,
}: {
  profile: Profile;
  organization?: Organization | null;
  notify: (message: string) => void;
  todayOnly?: boolean;
  hideHeader?: boolean;
}) {
  const [tab, setTab] = useState<"completed" | "cancelled">("completed");
  const [fromInput, setFromInput] = useState(() => getTodayStr());
  const [toInput, setToInput] = useState(() => getTodayStr());
  const [fromDate, setFromDate] = useState(() => getTodayStr());
  const [toDate, setToDate] = useState(() => getTodayStr());
  const [searchQuery, setSearchQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewSale, setViewSale] = useState<Row | null>(null);
  const [returnSale, setReturnSale] = useState<Row | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returning, setReturning] = useState(false);

  // Edit Bill State
  const [editSale, setEditSale] = useState<Row | null>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editPaymentMode, setEditPaymentMode] = useState<"cash" | "upi" | "card" | "bank" | "credit">("cash");
  const [editSpecialDiscountPercent, setEditSpecialDiscountPercent] = useState<number>(0);
  const [editDoctorFee, setEditDoctorFee] = useState<number>(0);
  const [newProductId, setNewProductId] = useState<string>("");
  const [newProduct, setNewProduct] = useState<Row | null>(null);
  const [newQty, setNewQty] = useState<number>(1);
  const [editSaving, setEditSaving] = useState(false);

  const parsedGst = parseSalesGstMode(organization?.sales_gst_mode);
  const isPriceOnly = parsedGst.mode === "price_only";
  const settingDiscount = Number(organization?.sales_discount_percent || 0);
  const minDiscountThreshold = Number(
    organization?.min_discount_medicine_value ??
    getBillingDiscountConfig(profile.organization_id, organization).minDiscountValue
  );

  const canEdit = (sale: Row) => {
    if (sale.status !== "completed") return false;
    if (profile.role === "admin" || profile.role === "software_owner") return true;
    const today = getTodayStr();
    const billDate = String(sale.sold_at || "").slice(0, 10);
    return billDate === today;
  };

  const load = () => {
    if (!supabase) return;
    setLoading(true);
    const start = todayOnly ? getTodayStr() + "T00:00:00" : fromDate + "T00:00:00";
    const end = todayOnly ? getTodayStr() + "T23:59:59" : toDate + "T23:59:59";
    supabase
      .from("sales")
      .select("id,invoice_no,sold_at,grand_total,medicine_subtotal,medicine_tax,special_discount_amount,pharmacy_revenue,doctor_fee,payment_mode,status,sale_type,patient_id,patient:patients(patient_id,name,mobile),sale_items(id,product_id,batch_id,quantity,returned_quantity,unit_rate,original_unit_rate,mrp,mrp_unit_rate,sales_discount_percent,original_sales_discount_percent,gst_percent,line_total,product:products(name,mrp,selling_rate,default_units_per_purchase_unit),batch:medicine_batches(batch_number,current_stock,stock_unit_qty,mrp,selling_rate,sales_discount_percent))")
      .eq("organization_id", profile.organization_id)
      .eq("status", tab)
      .gte("sold_at", start)
      .lte("sold_at", end)
      .order("sold_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        setRows(data || []);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    if (todayOnly) {
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }
  }, [tab, fromDate, toDate, profile.organization_id, todayOnly]);

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

  const getSaleItemPricing = (item: Row) => {
    const rate = Number(item.unit_rate || 0);
    const units = Number(item.product?.default_units_per_purchase_unit || 1) || 1;
    const fallbackBatchOrProdRate =
      Number(item.batch?.selling_rate || 0) > 0
        ? Number(item.batch.selling_rate)
        : Number(item.product?.selling_rate || 0) > 0
        ? Number(item.product.selling_rate)
        : Number(item.batch?.mrp || item.product?.mrp || 0) > 0
        ? Number(item.batch?.mrp || item.product?.mrp || 0) / units
        : 0;
    const mrpUnitRate =
      Number(item.mrp_unit_rate || 0) > 0
        ? Number(item.mrp_unit_rate)
        : Number(item.mrp || 0) > 0
        ? Number(item.mrp)
        : fallbackBatchOrProdRate > 0
        ? Math.ceil(fallbackBatchOrProdRate)
        : Number(item.original_unit_rate || rate || 0);

    const discountPercent =
      item.sales_discount_percent != null
        ? Number(item.sales_discount_percent)
        : item.original_sales_discount_percent != null
        ? Number(item.original_sales_discount_percent)
        : item.batch?.sales_discount_percent != null
        ? Number(item.batch.sales_discount_percent)
        : mrpUnitRate > rate && mrpUnitRate > 0
        ? Number((((mrpUnitRate - rate) / mrpUnitRate) * 100).toFixed(2))
        : Number(organization?.sales_discount_percent || 0);

    return {
      mrp_unit_rate: mrpUnitRate,
      sales_discount_percent: discountPercent,
      selling_rate: rate,
    };
  };

  const openEditModal = (sale: Row) => {
    setEditSale(sale);
    setEditPaymentMode((sale.payment_mode || "cash") as any);
    setEditSpecialDiscountPercent(Number(sale.special_discount_percent || 0));
    setEditDoctorFee(Number(sale.doctor_fee || 0));

    const items = (sale.sale_items || []).map((item: Row) => {
      const pricing = getSaleItemPricing(item);
      const units = Number(item.product?.default_units_per_purchase_unit || 1) || 1;
      const baseMrp =
        pricing.mrp_unit_rate > 0
          ? pricing.mrp_unit_rate
          : Number(item.mrp || 0) > 0
          ? Number(item.mrp)
          : Number(item.batch?.mrp || item.product?.mrp || 0) > 0
          ? Math.ceil(Number(item.batch?.mrp || item.product?.mrp) / units)
          : Number(pricing.selling_rate || item.unit_rate || 0);

      return {
        id: item.id,
        sale_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product?.name || "Medicine",
        category: item.product?.category || "",
        batch_id: item.batch_id,
        batch_number: item.batch?.batch_number || "-",
        current_batch_stock: getEffectiveStock(item.batch),
        original_quantity: Number(item.quantity || 0),
        quantity: Number(item.quantity || 0),
        returned_quantity: Number(item.returned_quantity || 0),
        mrp_unit_rate: baseMrp,
        original_sales_discount_percent: pricing.sales_discount_percent,
        configured_discount_percent: pricing.sales_discount_percent,
        sales_discount_percent: pricing.sales_discount_percent,
        unit_rate: pricing.selling_rate,
        original_unit_rate: item.original_unit_rate || pricing.selling_rate,
        gst_percent: Number(item.gst_percent || 0),
        rate_edited: !!item.rate_edited,
        is_new: false,
      };
    });

    setEditItems(items);
    setNewProductId("");
    setNewProduct(null);
    setNewQty(1);
  };

  const handleAddNewMedicineToEdit = async () => {
    if (!supabase || !newProductId || Number(newQty) <= 0 || !editSale) {
      notify("Select a medicine and quantity");
      return;
    }
    const res = await resolveBillingBatchesForProduct(supabase, {
      organizationId: profile.organization_id,
      productId: newProductId,
      product: newProduct,
      requestedQty: Number(newQty),
      cartItems: editItems.map((item) => ({ batch_id: item.batch_id, qty: item.quantity })),
      settingDiscount,
      minDiscountThreshold,
      today: getTodayStr(),
    });

    if (res.error || !res.allocations || !res.allocations.length) {
      notify(res.error || "Unable to allocate stock for medicine");
      return;
    }

    const newRows = res.allocations.map((alloc) => {
      const units = Number(newProduct?.default_units_per_purchase_unit || 1) || 1;
      const baseMrp = Number(alloc.mrp_unit_rate || alloc.mrp || (alloc.selling_rate ? Math.ceil(alloc.selling_rate) : 0));
      const eligible = minDiscountThreshold <= 0 || (editRawBillTotal + baseMrp * Number(alloc.qty || 1)) >= minDiscountThreshold;
      const discountToUse = eligible ? Number(alloc.sales_discount_percent || 0) : 0;
      const effectiveRate = discountToUse > 0 ? discountedSaleRate(baseMrp, 1, discountToUse) : baseMrp;
      return {
        id: `new-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        sale_item_id: null,
        product_id: newProductId,
        product_name: newProduct?.name || alloc.name || "Medicine",
        category: newProduct?.category || alloc.category || "",
        batch_id: alloc.batch_id,
        batch_number: alloc.batch_number || "PENDING",
        current_batch_stock: alloc.current_stock || 0,
        original_quantity: 0,
        quantity: alloc.qty,
        returned_quantity: 0,
        mrp_unit_rate: baseMrp,
        original_sales_discount_percent: Number(alloc.sales_discount_percent || 0),
        configured_discount_percent: Number(alloc.sales_discount_percent || 0),
        sales_discount_percent: discountToUse,
        unit_rate: effectiveRate,
        original_unit_rate: effectiveRate,
        gst_percent: Number(alloc.gst_percent || 0),
        rate_edited: false,
        is_new: true,
      };
    });

    setEditItems((prev) => [...prev, ...newRows]);
    setNewProductId("");
    setNewProduct(null);
    setNewQty(1);
    notify(`Added ${newRows.length} medicine line(s) to bill`);
  };

  const changeEditQty = (index: number, val: any) => {
    if (val === "") {
      setEditItems((items) => items.map((it, i) => (i === index ? { ...it, quantity: "" } : it)));
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) return;
    setEditItems((items) =>
      items.map((it, i) => {
        if (i !== index) return it;
        const minAllowed = Number(it.returned_quantity || 0);
        if (num < minAllowed) {
          notify(`Quantity cannot be less than returned quantity (${minAllowed})`);
          return it;
        }
        return { ...it, quantity: num };
      })
    );
  };

  const changeEditDiscount = (index: number, val: any) => {
    if (val === "") {
      setEditItems((items) => items.map((it, i) => (i === index ? { ...it, sales_discount_percent: "" } : it)));
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0 || num > 100) return;
    setEditItems((items) =>
      items.map((it, i) => {
        if (i !== index) return it;
        const base = Number(it.mrp_unit_rate || it.unit_rate || 0);
        const nextRate = discountedSaleRate(base, 1, num);
        return {
          ...it,
          sales_discount_percent: num,
          unit_rate: nextRate,
          rate_edited: true,
        };
      })
    );
  };

  const changeEditRate = (index: number, val: any) => {
    if (val === "") {
      setEditItems((items) => items.map((it, i) => (i === index ? { ...it, unit_rate: "" } : it)));
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) return;
    setEditItems((items) =>
      items.map((it, i) => {
        if (i !== index) return it;
        return {
          ...it,
          unit_rate: num,
          rate_edited: true,
        };
      })
    );
  };

  const removeEditItem = (index: number) => {
    const target = editItems[index];
    if (target && Number(target.returned_quantity || 0) > 0) {
      notify(`Cannot remove medicine with ${target.returned_quantity} returned unit(s)`);
      return;
    }
    setEditItems((items) => items.filter((_, i) => i !== index));
  };

  const saveEditedBill = async () => {
    if (!supabase || !editSale) return;
    if (editItems.length === 0 && Number(editDoctorFee || 0) <= 0) {
      notify("Bill must have at least one medicine or consultation fee");
      return;
    }
    if (editItems.some((it) => it.quantity === "" || Number(it.quantity) <= 0)) {
      notify("All medicines must have valid positive quantities");
      return;
    }

    setEditSaving(true);
    try {
      const medicine = editItems.reduce(
        (sum, item) =>
          sum +
          (isPriceOnly
            ? Number(item.unit_rate) * Number(item.quantity)
            : (Number(item.unit_rate) * Number(item.quantity)) / (1 + Number(item.gst_percent || 0) / 100)),
        0
      );
      const tax = editItems.reduce(
        (sum, item) =>
          sum +
          (isPriceOnly
            ? (Number(item.unit_rate) * Number(item.quantity) * Number(item.gst_percent || 0)) / 100
            : Number(item.unit_rate) * Number(item.quantity) -
              (Number(item.unit_rate) * Number(item.quantity)) / (1 + Number(item.gst_percent || 0) / 100)),
        0
      );
      const grossTotal = isPriceOnly
        ? medicine + tax
        : editItems.reduce((sum, item) => sum + Number(item.unit_rate) * Number(item.quantity), 0);
      const specialDiscountAmount = Number(
        ((medicine + tax) * (Number(editSpecialDiscountPercent || 0) / 100)).toFixed(2)
      );
      const medicineTotal = Math.max(0, grossTotal - specialDiscountAmount);
      const pharmacyRevenue = Math.max(0, Number(medicineTotal.toFixed(2)));
      const grandTotal = Number((medicineTotal + Number(editDoctorFee || 0)).toFixed(2));
      const hasRateEdit =
        editItems.some((i) => i.rate_edited) || Number(editSpecialDiscountPercent || 0) > 0;

      // 0. Check if any modified or newly added items will go into negative stock
      let wentNegativeStock = false;
      for (const item of editItems) {
        const diff = item.is_new ? Number(item.quantity) : Number(item.quantity) - Number(item.original_quantity);
        if (diff > 0 && item.batch_id) {
          const { data: freshBatch } = await supabase
            .from("medicine_batches")
            .select("id,batch_number,current_stock,stock_unit_qty")
            .eq("id", item.batch_id)
            .maybeSingle();
          const currentStock = getEffectiveStock(freshBatch);
          if (currentStock < diff) {
            wentNegativeStock = true;
          }
        }
      }

      // 1. Reconcile Stock for Removed Items
      const currentItemIds = new Set(editItems.filter((i) => !i.is_new && i.sale_item_id).map((i) => i.sale_item_id));
      const removedItems = (editSale.sale_items || []).filter((orig: Row) => !currentItemIds.has(orig.id));
      for (const rem of removedItems) {
        const qtyToReturn = Math.max(0, Number(rem.quantity || 0) - Number(rem.returned_quantity || 0));
        if (qtyToReturn > 0 && rem.batch_id) {
          const { data: freshBatch } = await supabase
            .from("medicine_batches")
            .select("id,current_stock,stock_unit_qty")
            .eq("id", rem.batch_id)
            .maybeSingle();
          const currentStock = getEffectiveStock(freshBatch || rem.batch);
          const newStock = currentStock + qtyToReturn;
          await updateBatchStock(supabase, rem.batch_id, newStock);
          await insertStockMovementSafe(supabase, {
            organization_id: profile.organization_id,
            product_id: rem.product_id,
            batch_id: rem.batch_id,
            movement_type: "sale_edit",
            reference_type: "sale_edit",
            reference_id: editSale.id,
            reference_number: editSale.invoice_no,
            in_quantity: qtyToReturn,
            balance_quantity: newStock,
            notes: `Item removed on bill edit: ${rem.product?.name || "Medicine"} (${editSale.invoice_no})`,
            created_by: profile.id,
          });
        }
        await supabase.from("sale_items").delete().eq("id", rem.id);
      }

      // 2. Reconcile Stock for Modified Existing Items
      for (const item of editItems.filter((i) => !i.is_new && i.sale_item_id)) {
        const diff = Number(item.quantity) - Number(item.original_quantity);
        if (diff !== 0 && item.batch_id) {
          const { data: freshBatch } = await supabase
            .from("medicine_batches")
            .select("id,current_stock,stock_unit_qty")
            .eq("id", item.batch_id)
            .maybeSingle();
          const currentStock = getEffectiveStock(freshBatch);
          const newStock = currentStock - diff;
          await updateBatchStock(supabase, item.batch_id, newStock);
          await insertStockMovementSafe(supabase, {
            organization_id: profile.organization_id,
            product_id: item.product_id,
            batch_id: item.batch_id,
            movement_type: "sale_edit",
            reference_type: "sale_edit",
            reference_id: editSale.id,
            reference_number: editSale.invoice_no,
            in_quantity: diff < 0 ? Math.abs(diff) : 0,
            out_quantity: diff > 0 ? diff : 0,
            balance_quantity: newStock,
            notes: `Qty modified (${item.original_quantity} -> ${item.quantity}) on bill ${editSale.invoice_no}`,
            created_by: profile.id,
          });
        }
        await supabase
          .from("sale_items")
          .update({
            quantity: Number(item.quantity),
            unit_rate: Number(item.unit_rate),
            original_unit_rate: Number(item.original_unit_rate || item.unit_rate),
            mrp_unit_rate: Number(item.mrp_unit_rate || item.unit_rate),
            sales_discount_percent: Number(item.sales_discount_percent || 0),
            line_total: Number((Number(item.unit_rate) * Number(item.quantity)).toFixed(2)),
            rate_edited: !!item.rate_edited,
          })
          .eq("id", item.sale_item_id);
      }

      // 3. Deduct Stock for Newly Added Items
      for (const item of editItems.filter((i) => i.is_new)) {
        if (item.batch_id) {
          const { data: freshBatch } = await supabase
            .from("medicine_batches")
            .select("id,current_stock,stock_unit_qty")
            .eq("id", item.batch_id)
            .maybeSingle();
          const currentStock = getEffectiveStock(freshBatch);
          const newStock = currentStock - Number(item.quantity);
          await updateBatchStock(supabase, item.batch_id, newStock);
          await insertStockMovementSafe(supabase, {
            organization_id: profile.organization_id,
            product_id: item.product_id,
            batch_id: item.batch_id,
            movement_type: "sale",
            reference_type: "sale_edit",
            reference_id: editSale.id,
            reference_number: editSale.invoice_no,
            out_quantity: Number(item.quantity),
            balance_quantity: newStock,
            notes: `Medicine added on bill edit: ${editSale.invoice_no}`,
            created_by: profile.id,
          });
        }
        await supabase.from("sale_items").insert({
          organization_id: profile.organization_id,
          sale_id: editSale.id,
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: Number(item.quantity),
          unit_rate: Number(item.unit_rate),
          original_unit_rate: Number(item.original_unit_rate || item.unit_rate),
          mrp: Number(item.mrp_unit_rate || item.unit_rate),
          mrp_unit_rate: Number(item.mrp_unit_rate || item.unit_rate),
          sales_discount_percent: Number(item.sales_discount_percent || 0),
          original_sales_discount_percent: Number(item.original_sales_discount_percent || 0),
          gst_percent: Number(item.gst_percent || 0),
          line_total: Number((Number(item.unit_rate) * Number(item.quantity)).toFixed(2)),
          rate_edited: !!item.rate_edited,
        });
      }

      // 4. Update Sales Table
      await supabase
        .from("sales")
        .update({
          medicine_subtotal: Number(medicine.toFixed(2)),
          medicine_tax: Number(tax.toFixed(2)),
          gross_total: Number(grossTotal.toFixed(2)),
          special_discount_percent: Number(editSpecialDiscountPercent || 0),
          special_discount_amount: specialDiscountAmount,
          pharmacy_revenue: pharmacyRevenue,
          doctor_fee: Number(editDoctorFee || 0),
          grand_total: grandTotal,
          payment_mode: editPaymentMode,
          has_rate_edit: hasRateEdit,
          rate_edit_verified: !hasRateEdit,
        })
        .eq("id", editSale.id);

      // 5. Update or Insert Payments
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("sale_id", editSale.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (existingPayment) {
        await supabase
          .from("payments")
          .update({
            amount: grandTotal,
            mode: editPaymentMode,
          })
          .eq("id", existingPayment.id);
      } else if (grandTotal > 0) {
        await supabase.from("payments").insert({
          organization_id: profile.organization_id,
          sale_id: editSale.id,
          patient_id: editSale.patient_id || null,
          amount: grandTotal,
          mode: editPaymentMode,
          created_by: profile.id,
        });
      }

      // 6. Update or Insert Cash Ledger
      const { data: existingCash } = await supabase
        .from("cash_ledger")
        .select("id")
        .eq("reference_type", "sale")
        .eq("reference_id", editSale.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (existingCash) {
        await supabase
          .from("cash_ledger")
          .update({
            amount: grandTotal,
            payment_mode: editPaymentMode,
          })
          .eq("id", existingCash.id);
      } else if (grandTotal > 0) {
        await supabase.from("cash_ledger").insert({
          organization_id: profile.organization_id,
          occurred_at: editSale.sold_at || new Date().toISOString(),
          entry_type: "receipt",
          category: `Sale ${editSale.invoice_no}`,
          reference_type: "sale",
          reference_id: editSale.id,
          amount: grandTotal,
          payment_mode: editPaymentMode,
          created_by: profile.id,
        });
      }

      // 7. Update Patient Ledger if Inpatient
      if (editSale.sale_type === "inpatient" || editSale.payment_mode === "credit") {
        await supabase
          .from("patient_ledger")
          .update({
            debit: grandTotal,
          })
          .eq("reference_type", "inpatient_bill")
          .eq("reference_id", editSale.id)
          .eq("organization_id", profile.organization_id);
      }

      // 8. Journal Entry Update
      try {
        const netPharmacySales = editItems.length > 0 ? Math.max(0, Number((medicineTotal - tax).toFixed(2))) : 0;
        const effectiveTax = editItems.length > 0 ? Math.max(0, Number((medicineTotal - netPharmacySales).toFixed(2))) : 0;
        const lines: Array<{ ledger: string; debit?: number; credit?: number }> = [
          { ledger: editPaymentMode === "cash" ? "Cash" : "Bank", debit: grandTotal },
        ];
        if (netPharmacySales > 0) lines.push({ ledger: "Pharmacy Sales", credit: netPharmacySales });
        if (effectiveTax > 0) lines.push({ ledger: "GST Payable", credit: effectiveTax });
        if (editDoctorFee > 0) lines.push({ ledger: "Consultation Revenue", credit: Number(editDoctorFee.toFixed(2)) });
        await postJournal(profile, {
          voucherType: "sale_edit",
          entryDate: new Date().toISOString(),
          referenceType: "sale",
          referenceId: editSale.id,
          referenceNumber: editSale.invoice_no,
          narration: `Bill edit adjustment for ${editSale.invoice_no} (${editPaymentMode.toUpperCase()})`,
          lines,
        });
      } catch {}

      globalMutate(
        (key) =>
          typeof key === "string" &&
          (key.includes("table:sales") ||
            key.includes("table:consultations") ||
            key.includes("table:products") ||
            key.includes("table:medicine_batches"))
      );

      notify(
        `Bill ${editSale.invoice_no} updated successfully!${wentNegativeStock ? " (Negative stock recorded - will auto-fill on purchase)" : ""}`
      );
      setEditSale(null);
      load();
    } catch (err: any) {
      notify(err?.message || "Failed to save edited bill");
    } finally {
      setEditSaving(false);
    }
  };

  const editRawBillTotal = editItems.reduce((sum, item) => {
    const unitPrice = Number(item.mrp_unit_rate || item.mrp || item.unit_rate || 0);
    return sum + unitPrice * Number(item.quantity || 0);
  }, 0);
  const isEditDiscountEligible = minDiscountThreshold <= 0 || editRawBillTotal >= minDiscountThreshold;

  const editMedicine = editItems.reduce(
    (sum, item) =>
      sum +
      (isPriceOnly
        ? Number(item.unit_rate) * Number(item.quantity)
        : (Number(item.unit_rate) * Number(item.quantity)) / (1 + Number(item.gst_percent || 0) / 100)),
    0
  );
  const editTax = editItems.reduce(
    (sum, item) =>
      sum +
      (isPriceOnly
        ? (Number(item.unit_rate) * Number(item.quantity) * Number(item.gst_percent || 0)) / 100
        : Number(item.unit_rate) * Number(item.quantity) -
          (Number(item.unit_rate) * Number(item.quantity)) / (1 + Number(item.gst_percent || 0) / 100)),
    0
  );
  const editGrossTotal = isPriceOnly
    ? editMedicine + editTax
    : editItems.reduce((sum, item) => sum + Number(item.unit_rate) * Number(item.quantity), 0);
  const editSpecialDiscountAmount = Number(
    ((editMedicine + editTax) * (Number(editSpecialDiscountPercent || 0) / 100)).toFixed(2)
  );
  const editMedicineTotal = Math.max(0, editGrossTotal - editSpecialDiscountAmount);
  const editGrandTotal = Number((editMedicineTotal + Number(editDoctorFee || 0)).toFixed(2));

  const activePrintCart = viewSale
    ? (viewSale.sale_items || []).map((item: Row) => {
        const pricing = getSaleItemPricing(item);
        return {
          name: item.product?.name || "Medicine",
          batch_number: item.batch?.batch_number || "-",
          qty: Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0)),
          mrp: pricing.mrp_unit_rate,
          mrp_unit_rate: pricing.mrp_unit_rate,
          sales_discount_percent: pricing.sales_discount_percent,
          selling_rate: pricing.selling_rate,
          gst_percent: Number(item.gst_percent || 0),
        };
      })
    : [];

  const filteredRows = rows.filter((sale) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      String(sale.invoice_no || "").toLowerCase().includes(q) ||
      String(sale.patient?.name || "").toLowerCase().includes(q) ||
      String(sale.patient?.mobile || "").toLowerCase().includes(q) ||
      String(sale.patient?.patient_id || "").toLowerCase().includes(q)
    );
  });

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
        {!hideHeader && (
          <div className="page-head">
            <div>
              <h1>{todayOnly ? "Today's Bills" : "Sales"}</h1>
              <p>{todayOnly ? "Today's sales register with invoice reprint, returns, and cancellation." : "Sales register with invoice reprint, partial returns, and cancellation audit."}</p>
            </div>
          </div>
        )}
        <div className="panel">
          <div className="sales-tools" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div className="tab-row sales-tabs" style={{ margin: 0 }}>
                <button type="button" className={tab==="completed"?"active":""} onClick={()=>setTab("completed")}>Completed ({tab==="completed" ? rows.length : ""})</button>
                <button type="button" className={tab==="cancelled"?"active":""} onClick={()=>setTab("cancelled")}>Cancelled ({tab==="cancelled" ? rows.length : ""})</button>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoice or patient..."
                style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", minWidth: "210px" }}
              />
            </div>
            {todayOnly ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>
                  Today&apos;s Total ({rows.length} bills): {money(rows.reduce((sum, r) => sum + Number(r.grand_total || 0), 0))}
                </span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => { load(); notify("Today's bills refreshed"); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "34px", fontSize: "13px" }}
                >
                  <RotateCw size={14} /> Refresh Bills
                </button>
              </div>
            ) : (
              <form className="sales-date-form" onSubmit={(e) => { e.preventDefault(); setFromDate(fromInput); setToDate(toInput); }}>
                <div className="sales-date-headings"><span>From</span><span>To</span></div>
                <div className="sales-date-inputs"><input aria-label="From date" type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} required /><input aria-label="To date" type="date" value={toInput} min={fromInput} onChange={(e) => setToInput(e.target.value)} required /></div>
                <button type="submit" className="primary">Load</button>
              </form>
            )}
          </div>
          {loading ? <div className="loading-panel">Loading sales...</div> : filteredRows.length ? (
            <div className="data-wrap">
              <table className="data-table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Type</th><th>Mode</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {filteredRows.map((sale) => (
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
                          {tab === "completed" && canEdit(sale) && (
                            <button
                              type="button"
                              className="table-edit"
                              onClick={() => openEditModal(sale)}
                              style={{ color: "#0284c7" }}
                              title="Edit medicine, quantity, discount, rate, or payment mode"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                          )}
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
            <div className="panel" style={{ width: "100%", maxWidth: "780px", background: "#fff", borderRadius: "12px", padding: "20px", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Invoice {viewSale.invoice_no}</h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>{fmtDate(viewSale.sold_at)} · {viewSale.patient?.name || "Walk-in"} · Mode: {String(viewSale.payment_mode || "cash").toUpperCase()}</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {canEdit(viewSale) && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const s = viewSale;
                        setViewSale(null);
                        openEditModal(s);
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <Pencil size={15}/> Edit Bill
                    </button>
                  )}
                  <button type="button" className="primary" onClick={() => window.print()}><Printer size={15}/> Print Invoice</button>
                  <button type="button" className="table-edit" onClick={() => setViewSale(null)}><X size={16}/></button>
                </div>
              </div>
              <div className="data-wrap">
                <table className="data-table">
                  <thead><tr><th>Medicine</th><th>Batch</th><th>Sold Qty</th><th>Returned</th><th>MRP</th><th>Discount</th><th>Rate</th><th>Total</th></tr></thead>
                  <tbody>
                    {(viewSale.sale_items || []).map((item: Row) => {
                      const pricing = getSaleItemPricing(item);
                      return (
                        <tr key={item.id}>
                          <td>{item.product?.name || "-"}</td>
                          <td>{item.batch?.batch_number || "-"}</td>
                          <td>{item.quantity}</td>
                          <td>{item.returned_quantity || 0}</td>
                          <td>{money(pricing.mrp_unit_rate)}</td>
                          <td>{Number(pricing.sales_discount_percent || 0)}%</td>
                          <td>{money(pricing.selling_rate)}</td>
                          <td>{money(pricing.selling_rate * Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0)))}</td>
                        </tr>
                      );
                    })}
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

        {editSale && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.65)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
          >
            <div
              className="panel"
              style={{
                width: "100%",
                maxWidth: "960px",
                background: "#fff",
                borderRadius: "12px",
                padding: "24px",
                maxHeight: "92vh",
                overflowY: "auto",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              }}
            >
              {/* Modal Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h2 style={{ margin: 0, fontSize: "19px", color: "#0f172a" }}>Edit Bill — {editSale.invoice_no}</h2>
                    <span style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "999px", background: "#e0f2fe", color: "#0369a1", fontWeight: 700 }}>
                      {String(editSale.sale_type || "outpatient").toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                    {fmtDate(editSale.sold_at)} · Patient: <strong>{editSale.patient?.name || "Walk-in"}</strong> {editSale.patient?.mobile ? `(${editSale.patient.mobile})` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="table-edit"
                  onClick={() => setEditSale(null)}
                  style={{ padding: "6px", borderRadius: "6px" }}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Bill Details / Payment Mode Bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "14px",
                  background: "#f8fafc",
                  padding: "14px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  <span>Payment Mode *</span>
                  <select
                    value={editPaymentMode}
                    onChange={(e) => setEditPaymentMode(e.target.value as any)}
                    style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / Online</option>
                    <option value="card">Card</option>
                    <option value="bank">Bank Transfer</option>
                    {editSale.sale_type === "inpatient" && <option value="credit">Credit (Inpatient Ledger)</option>}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  <span>Special Discount %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={editSpecialDiscountPercent}
                    onChange={(e) => setEditSpecialDiscountPercent(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
                    style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  <span>Doctor Consultation Fee (₹)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editDoctorFee}
                    onChange={(e) => setEditDoctorFee(Math.max(0, Number(e.target.value || 0)))}
                    style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </label>
              </div>

              {/* Add New Medicine Bar */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#166534", marginBottom: "8px" }}>
                  Add Medicine to this Bill:
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "260px" }}>
                    <AsyncSelect
                      table="products"
                      select="id,product_id,name,category,generic_name,box_number,gst_percent,mrp,selling_rate,purchase_rate,default_units_per_purchase_unit"
                      searchColumns={["name", "category", "generic_name", "product_id", "barcode", "box_number"]}
                      label="Select Medicine to Add"
                      value={newProductId}
                      onChange={(id, row) => {
                        setNewProductId(id);
                        setNewProduct(row || null);
                      }}
                      render={productText}
                    />
                  </div>
                  <label className="field qty-field" style={{ width: "90px", margin: 0 }}>
                    <span>Quantity</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newQty}
                      onChange={(e) => setNewQty(Math.max(1, Number(e.target.value || 1)))}
                      style={{ height: "38px" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleAddNewMedicineToEdit}
                    disabled={!newProductId}
                    style={{ height: "38px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Plus size={16} /> Add to Bill
                  </button>
                </div>
              </div>

              {/* Discount Threshold Alert Banner */}
              {minDiscountThreshold > 0 && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: isEditDiscountEligible ? "#f0fdf4" : "#fffbeb",
                    border: isEditDiscountEligible ? "1px solid #86efac" : "1px solid #fde68a",
                    color: isEditDiscountEligible ? "#166534" : "#92400e",
                  }}
                >
                  {isEditDiscountEligible ? (
                    <>
                      <CheckCircle2 size={15} style={{ color: "#16a34a", flexShrink: 0 }} />
                      <span>
                        Bill Total (MRP {money(editRawBillTotal)}) qualifies for medicine discount (Min: {money(minDiscountThreshold)}).
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={15} style={{ color: "#d97706", flexShrink: 0 }} />
                      <span>
                        Bill Total (MRP {money(editRawBillTotal)}) is below minimum {money(minDiscountThreshold)} for discount.
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Medicines Table */}
              <div style={{ marginBottom: "8px", fontWeight: 700, fontSize: "14px", color: "#334155" }}>
                Bill Medicines ({editItems.length})
              </div>
              <div className="data-wrap" style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: "35px" }}>#</th>
                      <th>Medicine & Batch</th>
                      <th style={{ width: "95px", textAlign: "center" }}>Qty</th>
                      <th style={{ width: "85px", textAlign: "right" }}>MRP Unit</th>
                      <th style={{ width: "95px", textAlign: "center" }}>Discount %</th>
                      <th style={{ width: "95px", textAlign: "right" }}>Final Rate</th>
                      <th style={{ width: "95px", textAlign: "right" }}>Line Total</th>
                      <th style={{ width: "45px", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                          No medicines in this bill. Use the box above to add medicines.
                        </td>
                      </tr>
                    ) : (
                      editItems.map((item, idx) => {
                        const lineTotal = Number((Number(item.unit_rate || 0) * Number(item.quantity || 0)).toFixed(2));
                        const minReturn = Math.max(1, Number(item.returned_quantity || 0));
                        return (
                          <tr key={item.id} style={{ background: item.is_new ? "#f0fdf4" : undefined }}>
                            <td style={{ color: "#64748b", fontSize: "12px" }}>{idx + 1}</td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>
                                Batch: <b>{item.batch_number}</b>
                                {item.is_new && (
                                  <span style={{ marginLeft: "6px", background: "#dcfce7", color: "#15803d", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>
                                    NEW
                                  </span>
                                )}
                                {item.returned_quantity > 0 && (
                                  <span style={{ marginLeft: "6px", color: "#d97706" }}>
                                    ({item.returned_quantity} already returned)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="number"
                                min={minReturn}
                                step="1"
                                value={item.quantity === "" ? "" : item.quantity}
                                onChange={(e) => changeEditQty(idx, e.target.value)}
                                style={{ width: "70px", padding: "6px", textAlign: "center", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 600 }}
                              />
                            </td>
                            <td style={{ textAlign: "right", color: "#475569" }}>
                              {money(item.mrp_unit_rate)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={item.sales_discount_percent === "" ? "" : item.sales_discount_percent}
                                onChange={(e) => changeEditDiscount(idx, e.target.value)}
                                style={{ width: "65px", padding: "6px", textAlign: "center", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                              />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unit_rate === "" ? "" : item.unit_rate}
                                onChange={(e) => changeEditRate(idx, e.target.value)}
                                style={{ width: "80px", padding: "6px", textAlign: "right", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 600 }}
                              />
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                              {money(lineTotal)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="table-edit danger-btn"
                                onClick={() => removeEditItem(idx)}
                                title="Remove medicine from bill"
                                style={{ padding: "4px 8px" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginTop: "16px",
                  padding: "14px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#475569", flexWrap: "wrap" }}>
                  <span>Medicine: <b>{money(editMedicine)}</b></span>
                  <span>GST Tax: <b>{money(editTax)}</b></span>
                  {editSpecialDiscountAmount > 0 && (
                    <span>Special Disc ({editSpecialDiscountPercent}%): <b style={{ color: "#16a34a" }}>-{money(editSpecialDiscountAmount)}</b></span>
                  )}
                  {Number(editDoctorFee || 0) > 0 && (
                    <span>Doctor Fee: <b style={{ color: "#0284c7" }}>{money(editDoctorFee)}</b></span>
                  )}
                </div>
                <div style={{ fontSize: "17px", fontWeight: 800, color: "#15803d" }}>
                  Grand Total: {money(editGrandTotal)}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditSale(null)}
                  disabled={editSaving}
                  style={{ minWidth: "90px" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={saveEditedBill}
                  disabled={editSaving || (editItems.length === 0 && Number(editDoctorFee || 0) <= 0)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "160px" }}
                >
                  {editSaving ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  {editSaving ? "Saving Bill Changes..." : "Save Bill Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import { SupabaseClient } from "@supabase/supabase-js";

export type AnyRow = Record<string, any>;

export const PENDING_BATCH_NUMBER = "PENDING-STOCK";

export function todayDateString(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function defaultPendingExpiryDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function roundedSaleRate(mrp: any, retailCount: any): number {
  const units = Number(retailCount || 1) || 1;
  const rate = Number(mrp || 0) / units;
  return rate > 0 ? Math.ceil(rate) : 0;
}

export function discountedSaleRate(mrp: any, retailCount: any, discountPercent: any): number {
  const rate = roundedSaleRate(mrp, retailCount);
  const discount = rate * (Number(discountPercent || 0) / 100);
  return Math.max(0, Number((rate - discount).toFixed(2)));
}

/**
 * Returns the true effective stock of a batch row, supporting both native negative
 * `current_stock` (after SQL migration) and negative `stock_unit_qty` fallback
 * (if the database check constraint `current_stock >= 0` has not been dropped yet).
 */
export function getEffectiveStock(batch: AnyRow | null | undefined): number {
  if (!batch) return 0;
  const current = Number(batch.current_stock ?? 0);
  if (current < 0) return current;
  const unitQty = batch.stock_unit_qty !== undefined && batch.stock_unit_qty !== null ? Number(batch.stock_unit_qty) : null;
  if (current === 0 && unitQty !== null && Number.isFinite(unitQty) && unitQty < 0) {
    return unitQty;
  }
  return Number.isFinite(current) ? current : 0;
}

/**
 * Normalizes a batch row so `current_stock` always reflects `getEffectiveStock(batch)`.
 */
export function normalizeBatchRow<T extends AnyRow>(batch: T): T {
  if (!batch) return batch;
  return {
    ...batch,
    current_stock: getEffectiveStock(batch),
  };
}

/**
 * Updates `current_stock` (and `stock_unit_qty`) on `medicine_batches`.
 * If `newBalance < 0` and the database still has `medicine_batches_current_stock_check`,
 * falls back to `{ current_stock: 0, stock_unit_qty: newBalance }` so negative stock
 * still works seamlessly.
 */
export async function updateBatchStock(
  supabase: SupabaseClient,
  batchId: string,
  newBalance: number,
  extraUpdates: Record<string, any> = {}
): Promise<void> {
  const primaryPayload = {
    ...extraUpdates,
    current_stock: newBalance,
    stock_unit_qty: newBalance,
  };

  const { error } = await supabase
    .from("medicine_batches")
    .update(primaryPayload)
    .eq("id", batchId);

  if (!error) return;

  // Fallback if check constraint `current_stock >= 0` is still active on DB
  if (newBalance < 0 && (error.code === "23514" || /current_stock|check constraint/i.test(error.message || ""))) {
    const fallbackPayload = {
      ...extraUpdates,
      current_stock: 0,
      stock_unit_qty: newBalance,
    };
    const { error: fallbackErr } = await supabase
      .from("medicine_batches")
      .update(fallbackPayload)
      .eq("id", batchId);
    if (fallbackErr) {
      // Final fallback in case stock_unit_qty column is missing
      await supabase
        .from("medicine_batches")
        .update({ ...extraUpdates, current_stock: 0 })
        .eq("id", batchId);
    }
    return;
  }

  // Fallback if `stock_unit_qty` column doesn't exist on older schema
  if (/stock_unit_qty/i.test(error.message || "")) {
    const { stock_unit_qty: _ignored, ...withoutStockUnitQty } = primaryPayload;
    await supabase
      .from("medicine_batches")
      .update({ ...withoutStockUnitQty, current_stock: Math.max(0, newBalance) })
      .eq("id", batchId);
  }
}

/**
 * Inserts a `stock_movements` row, gracefully handling negative `balance_quantity`
 * if the database check constraint `balance_quantity >= 0` has not been dropped yet.
 */
export async function insertStockMovementSafe(
  supabase: SupabaseClient,
  payload: Record<string, any>
): Promise<void> {
  const { error } = await supabase.from("stock_movements").insert(payload);
  if (!error) return;

  if (
    Number(payload.balance_quantity) < 0 &&
    (error.code === "23514" || /balance_quantity|check constraint/i.test(error.message || ""))
  ) {
    await supabase.from("stock_movements").insert({
      ...payload,
      balance_quantity: 0,
    });
  }
}

/**
 * Fetches rate & stock preview for a medicine in Billing / Inpatient Billing.
 * Falls back to the latest batch or product master if no positive FEFO batch exists.
 */
export async function fetchBillingRatePreview(
  supabase: SupabaseClient,
  {
    productId,
    product,
    settingDiscount,
    isPriceOnly,
    minDiscountThreshold = 0,
    today = todayDateString(),
  }: {
    productId: string;
    product: AnyRow | null;
    settingDiscount: number;
    isPriceOnly: boolean;
    minDiscountThreshold?: number;
    today?: string;
  }
) {
  const { data: batches } = await supabase
    .from("medicine_batches")
    .select("id,batch_number,expiry_date,current_stock,stock_unit_qty,selling_rate,mrp,gst_percent,sales_discount_percent,created_at")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true })
    .order("created_at", { ascending: true });

  const allBatches = (batches || []).map(normalizeBatchRow);
  const totalAvailableStock = allBatches.reduce((sum, b) => sum + Number(b.current_stock || 0), 0);

  // 1. Prefer positive unexpired FEFO batch
  const fefoBatch = allBatches.find(
    (b) => Number(b.current_stock) > 0 && (!b.expiry_date || b.expiry_date >= today)
  );

  // 2. Otherwise fallback to the most recently created batch
  const latestBatch =
    fefoBatch ||
    [...allBatches].sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    )[0] ||
    null;

  if (latestBatch) {
    const baseSellingRate =
      Number(latestBatch.selling_rate || 0) > 0
        ? Number(latestBatch.selling_rate)
        : Number(product?.selling_rate || product?.mrp || latestBatch.mrp || 0);
    const mrpUnitRate = Math.ceil(baseSellingRate);
    const discount =
      latestBatch.sales_discount_percent == null
        ? settingDiscount
        : Number(latestBatch.sales_discount_percent);
    const finalRate = discountedSaleRate(baseSellingRate, 1, discount);
    const gst = Number(latestBatch.gst_percent ?? product?.gst_percent ?? 0);
    const taxEach = isPriceOnly ? (finalRate * gst) / 100 : finalRate - finalRate / (1 + gst / 100);

    return {
      mrp_unit_rate: mrpUnitRate,
      sales_discount_percent: discount,
      final_rate: finalRate,
      gst_percent: gst,
      tax_each: taxEach,
      bill_rate: isPriceOnly ? finalRate + taxEach : finalRate,
      available_stock: totalAvailableStock,
      batch_number: latestBatch.batch_number,
      is_negative_or_zero: !fefoBatch,
    };
  }

  // 3. Fallback to product master when no batches exist yet
  const units = Number(product?.default_units_per_purchase_unit || 1) || 1;
  const prodSellingRate =
    Number(product?.selling_rate || 0) > 0
      ? Number(product?.selling_rate)
      : Number(product?.mrp || 0) / units;
  const mrpUnitRate = Math.ceil(prodSellingRate);
  const discount = settingDiscount;
  const finalRate = discountedSaleRate(prodSellingRate, 1, discount);
  const gst = Number(product?.gst_percent || 0);
  const taxEach = isPriceOnly ? (finalRate * gst) / 100 : finalRate - finalRate / (1 + gst / 100);

  return {
    mrp_unit_rate: mrpUnitRate,
    sales_discount_percent: discount,
    final_rate: finalRate,
    gst_percent: gst,
    tax_each: taxEach,
    bill_rate: isPriceOnly ? finalRate + taxEach : finalRate,
    available_stock: 0,
    batch_number: PENDING_BATCH_NUMBER,
    is_negative_or_zero: true,
  };
}

/**
 * Resolves one or more cart line items for a medicine being billed.
 * - Uses available positive FEFO batches first.
 * - If stock is 0, insufficient, or negative, allocates the deficit to the most recent batch
 *   (or creates/reuses a `PENDING-STOCK` batch if the medicine has no batches yet),
 *   allowing stock to go negative.
 */
export async function resolveBillingBatchesForProduct(
  supabase: SupabaseClient,
  {
    organizationId,
    productId,
    product,
    requestedQty,
    cartItems,
    settingDiscount,
    minDiscountThreshold = 0,
    today = todayDateString(),
  }: {
    organizationId: string;
    productId: string;
    product: AnyRow | null;
    requestedQty: number;
    cartItems: AnyRow[];
    settingDiscount: number;
    minDiscountThreshold?: number;
    today?: string;
  }
): Promise<{
  allocations: AnyRow[];
  wentNegative: boolean;
  projectedBalance: number;
  error?: string;
}> {
  const { data: rawBatches, error } = await supabase
    .from("medicine_batches")
    .select("id,batch_number,expiry_date,current_stock,stock_unit_qty,selling_rate,mrp,gst_percent,sales_discount_percent,created_at")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return { allocations: [], wentNegative: false, projectedBalance: 0, error: error.message };
  }

  // Calculate how much of each batch is already in the cart
  const inCartByBatch = new Map<string, number>();
  for (const item of cartItems) {
    if (item.batch_id) {
      inCartByBatch.set(item.batch_id, (inCartByBatch.get(item.batch_id) || 0) + Number(item.qty || 0));
    }
  }

  const allBatches = (rawBatches || []).map((b) => {
    const effective = getEffectiveStock(b);
    const alreadyInCart = inCartByBatch.get(b.id) || 0;
    return {
      ...b,
      current_stock: effective,
      available_after_cart: effective - alreadyInCart,
    };
  });

  const allocations: AnyRow[] = [];
  let remainingQty = Number(requestedQty);
  let wentNegative = false;
  let lastProjectedBalance = 0;

  const buildCartRow = (batch: AnyRow, qtyToUse: number, isNegativeAllocation: boolean) => {
    const units = Number(product?.default_units_per_purchase_unit || 1) || 1;
    const fallbackRate =
      Number(batch.selling_rate || 0) > 0
        ? Number(batch.selling_rate)
        : Number(product?.selling_rate || 0) > 0
        ? Number(product?.selling_rate)
        : Number(batch.mrp || product?.mrp || 0) / units;
    const mrpUnitRate = Math.ceil(fallbackRate);
    const discount =
      batch.sales_discount_percent == null
        ? settingDiscount
        : Number(batch.sales_discount_percent);
    const originalRate = discountedSaleRate(fallbackRate, 1, discount);

    return {
      ...product,
      ...batch,
      product_id: productId,
      batch_id: batch.id,
      qty: qtyToUse,
      mrp: Number(batch.mrp || product?.mrp || fallbackRate || 0),
      mrp_unit_rate: mrpUnitRate,
      gst_percent: Number(batch.gst_percent ?? product?.gst_percent ?? 0),
      sales_discount_percent: discount,
      original_sales_discount_percent: discount,
      configured_discount_percent: discount,
      original_selling_rate: originalRate,
      selling_rate: originalRate,
      rate_edited: false,
      negative_stock_billing: isNegativeAllocation,
    };
  };

  // Step 1: Allocate from positive unexpired FEFO batches
  const positiveFefoBatches = allBatches.filter(
    (b) => b.available_after_cart > 0 && (!b.expiry_date || b.expiry_date >= today)
  );

  for (const batch of positiveFefoBatches) {
    if (remainingQty <= 0) break;
    const take = Math.min(remainingQty, batch.available_after_cart);
    if (take > 0) {
      allocations.push(buildCartRow(batch, take, false));
      batch.available_after_cart -= take;
      lastProjectedBalance = batch.available_after_cart;
      remainingQty -= take;
    }
  }

  // Step 2: If still remainingQty > 0, take the deficit on an existing batch (going negative)
  if (remainingQty > 0 && allBatches.length > 0) {
    wentNegative = true;
    // If we just partially consumed the last positive FEFO batch, put the remaining deficit on that same batch
    // so the bill doesn't split unnecessarily across an older depleted batch, OR use the latest created batch.
    const lastAllocatedBatchId = allocations.length > 0 ? allocations[allocations.length - 1].batch_id : null;
    const targetBatch =
      (lastAllocatedBatchId && allBatches.find((b) => b.id === lastAllocatedBatchId)) ||
      [...allBatches].sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
      )[0];

    if (allocations.length > 0 && allocations[allocations.length - 1].batch_id === targetBatch.id) {
      allocations[allocations.length - 1].qty += remainingQty;
      allocations[allocations.length - 1].negative_stock_billing = true;
    } else {
      allocations.push(buildCartRow(targetBatch, remainingQty, true));
    }
    targetBatch.available_after_cart -= remainingQty;
    lastProjectedBalance = targetBatch.available_after_cart;
    remainingQty = 0;
  }

  // Step 3: No batch exists in `medicine_batches` at all -> create or reuse `PENDING-STOCK` batch
  if (remainingQty > 0 && allBatches.length === 0) {
    wentNegative = true;
    const units = Number(product?.default_units_per_purchase_unit || 1) || 1;
    const prodMrp = Number(product?.mrp || 0);
    const prodSellingRate =
      Number(product?.selling_rate || 0) > 0
        ? Number(product?.selling_rate)
        : prodMrp > 0
        ? prodMrp / units
        : 0;
    const prodPurchaseRate = Number(product?.purchase_rate || 0);
    const prodGst = Number(product?.gst_percent || 0);

    const { data: createdBatch, error: createErr } = await supabase
      .from("medicine_batches")
      .insert({
        organization_id: organizationId,
        product_id: productId,
        batch_number: PENDING_BATCH_NUMBER,
        expiry_date: defaultPendingExpiryDate(),
        quantity_received: 0,
        free_quantity: 0,
        current_stock: 0,
        stock_unit_qty: 0,
        purchase_rate: prodPurchaseRate,
        mrp: prodMrp,
        selling_rate: prodSellingRate,
        gst_percent: prodGst,
      })
      .select("id,batch_number,expiry_date,current_stock,stock_unit_qty,selling_rate,mrp,gst_percent,sales_discount_percent,created_at")
      .single();

    if (createErr || !createdBatch) {
      return {
        allocations: [],
        wentNegative: true,
        projectedBalance: 0,
        error: createErr?.message || "Failed to initialize pending stock batch for zero-stock billing",
      };
    }

    const normalizedCreated = normalizeBatchRow(createdBatch);
    allocations.push(buildCartRow(normalizedCreated, remainingQty, true));
    lastProjectedBalance = -remainingQty;
    remainingQty = 0;
  }

  return {
    allocations,
    wentNegative,
    projectedBalance: lastProjectedBalance,
  };
}

/**
 * Evaluates the entire bill total against the minimum bill threshold for discount.
 * If the undiscounted bill total is below minBillThreshold, 0% discount is applied to the bill.
 * If the undiscounted bill total is >= minBillThreshold, each medicine's configured discount % is applied.
 * Custom rate edits made manually by cashier (item.rate_edited) are respected and not overwritten.
 */
export function applyBillDiscountRule<T extends Record<string, any>>(
  cartItems: T[],
  minBillThreshold: number
): T[] {
  if (!cartItems.length) return cartItems;

  const threshold = Number(minBillThreshold) || 0;

  // Calculate gross bill total at MRP / undiscounted unit rate
  const rawBillTotal = cartItems.reduce((sum, item) => {
    const unitPrice = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
    return sum + unitPrice * Number(item.qty || 0);
  }, 0);

  const qualifies = threshold <= 0 || rawBillTotal >= threshold;

  return cartItems.map((item) => {
    // If cashier manually typed a custom rate/discount, preserve their edit
    if (item.rate_edited) return item;

    const baseRate = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
    const configuredDiscount = Number(
      item.configured_discount_percent ??
      item.original_sales_discount_percent ??
      item.sales_discount_percent ??
      0
    );
    const activeDiscount = qualifies ? configuredDiscount : 0;
    const activeRate = activeDiscount > 0 ? discountedSaleRate(baseRate, 1, activeDiscount) : baseRate;

    if (
      Number(item.sales_discount_percent) === activeDiscount &&
      Math.abs(Number(item.selling_rate) - activeRate) < 0.001
    ) {
      return item;
    }

    return {
      ...item,
      configured_discount_percent: configuredDiscount,
      original_sales_discount_percent: configuredDiscount,
      sales_discount_percent: activeDiscount,
      selling_rate: activeRate,
    };
  });
}

/**
 * Deducts stock for a single billed cart item and records the stock movement.
 * Reads the live batch stock from DB first so multiple lines or negative balances stay accurate.
 */
export async function deductSaleItemStock(
  supabase: SupabaseClient,
  {
    organizationId,
    saleId,
    invoiceNo,
    createdBy,
    item,
    referenceType = "sale",
  }: {
    organizationId: string;
    saleId: string;
    invoiceNo: string;
    createdBy: string;
    item: AnyRow;
    referenceType?: string;
  }
): Promise<number> {
  const { data: liveBatch } = await supabase
    .from("medicine_batches")
    .select("id,batch_number,current_stock,stock_unit_qty,mrp,selling_rate")
    .eq("id", item.batch_id)
    .maybeSingle();

  const startStock = liveBatch ? getEffectiveStock(liveBatch) : Number(item.current_stock || 0);
  const qty = Number(item.qty || 0);
  const newBalance = startStock - qty;

  const extraUpdates: Record<string, any> = {};
  if (
    liveBatch &&
    liveBatch.batch_number === PENDING_BATCH_NUMBER &&
    Number(liveBatch.selling_rate || 0) === 0 &&
    Number(item.selling_rate || 0) > 0
  ) {
    extraUpdates.selling_rate = Number(item.selling_rate);
    extraUpdates.mrp = Number(item.mrp || item.mrp_unit_rate || item.selling_rate);
  }

  await updateBatchStock(supabase, item.batch_id, newBalance, extraUpdates);

  await insertStockMovementSafe(supabase, {
    organization_id: organizationId,
    product_id: item.product_id,
    batch_id: item.batch_id,
    movement_type: "sale",
    reference_type: referenceType,
    reference_id: saleId,
    reference_number: invoiceNo,
    out_quantity: qty,
    balance_quantity: newBalance,
    created_by: createdBy,
  });

  return newBalance;
}

export interface PurchaseStockItemInput {
  product_id: string;
  batch_number: string;
  expiry_date: string | null;
  purchase_pack_qty: number;
  free_pack_qty: number;
  units_per_purchase_unit: number;
  total_stock_qty: number;
  free_stock_qty: number;
  purchase_rate_per_unit: number;
  mrp: number;
  selling_rate_per_unit: number;
  sales_discount_percent?: number | null;
  gst_percent: number;
  discount_amount: number;
  line_total: number;
  purchase_unit?: string;
  sale_unit?: string;
}

/**
 * Receives purchased stock for an item and automatically fills/offsets any negative stock
 * batches for the same product first.
 */
export async function receivePurchaseStockWithNegativeOffset(
  supabase: SupabaseClient,
  {
    organizationId,
    purchaseId,
    purchaseNo,
    supplierId,
    createdBy,
    item,
  }: {
    organizationId: string;
    purchaseId: string;
    purchaseNo: string;
    supplierId: string;
    createdBy: string;
    item: PurchaseStockItemInput;
  }
): Promise<{
  batchId: string;
  negativeOffsetFilled: number;
  offsetTotal: number;
  finalBatchStock: number;
}> {
  const totalIncomingQty = Number(item.total_stock_qty || 0);
  let remainingNetStock = totalIncomingQty;
  let totalNegativeOffsetFilled = 0;
  let crossBatchOffsetFilled = 0;

  const cleanBatchNumber = String(item.batch_number || "").trim();

  // 1. Fetch all existing batches for this product in this organization
  const { data: existingBatches } = await supabase
    .from("medicine_batches")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("product_id", item.product_id)
    .order("created_at", { ascending: true });

  const allBatches = existingBatches || [];

  // Separate target batch (if same batch_number already exists) vs other batches
  const existingTargetBatch = allBatches.find(
    (b) => String(b.batch_number || "").trim().toLowerCase() === cleanBatchNumber.toLowerCase()
  );

  // 2. Offset any OTHER batches of this product that currently have negative stock (oldest first, PENDING-STOCK prioritized)
  const negativeOtherBatches = allBatches
    .filter((b) => (!existingTargetBatch || b.id !== existingTargetBatch.id) && getEffectiveStock(b) < 0)
    .sort((a, b) => {
      if (a.batch_number === PENDING_BATCH_NUMBER && b.batch_number !== PENDING_BATCH_NUMBER) return -1;
      if (b.batch_number === PENDING_BATCH_NUMBER && a.batch_number !== PENDING_BATCH_NUMBER) return 1;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

  for (const negBatch of negativeOtherBatches) {
    if (remainingNetStock <= 0) break;
    const negStock = getEffectiveStock(negBatch);
    const deficit = Math.abs(negStock);
    const fillQty = Math.min(remainingNetStock, deficit);
    if (fillQty <= 0) continue;

    const newNegBalance = negStock + fillQty;
    const extraNegUpdates: Record<string, any> = {};
    if (negBatch.batch_number === PENDING_BATCH_NUMBER || Number(negBatch.purchase_rate || 0) === 0) {
      extraNegUpdates.purchase_rate = item.purchase_rate_per_unit;
    }
    if (negBatch.batch_number === PENDING_BATCH_NUMBER && Number(negBatch.mrp || 0) === 0) {
      extraNegUpdates.mrp = item.mrp;
      extraNegUpdates.selling_rate = item.selling_rate_per_unit;
    }

    await updateBatchStock(supabase, negBatch.id, newNegBalance, extraNegUpdates);

    await insertStockMovementSafe(supabase, {
      organization_id: organizationId,
      product_id: item.product_id,
      batch_id: negBatch.id,
      movement_type: "adjustment_in",
      reference_type: "negative_stock_fill",
      reference_id: purchaseId,
      reference_number: purchaseNo,
      in_quantity: fillQty,
      balance_quantity: newNegBalance,
      created_by: createdBy,
    });

    remainingNetStock -= fillQty;
    crossBatchOffsetFilled += fillQty;
    totalNegativeOffsetFilled += fillQty;
  }

  // 3. Create or update the target purchased batch
  let targetBatchId = "";
  let finalBatchStock = remainingNetStock;

  if (existingTargetBatch) {
    const prevTargetStock = getEffectiveStock(existingTargetBatch);
    if (prevTargetStock < 0) {
      const selfFilled = Math.min(remainingNetStock, Math.abs(prevTargetStock));
      totalNegativeOffsetFilled += selfFilled;
    }
    finalBatchStock = prevTargetStock + remainingNetStock;
    targetBatchId = existingTargetBatch.id;

    await updateBatchStock(supabase, targetBatchId, finalBatchStock, {
      expiry_date: item.expiry_date || existingTargetBatch.expiry_date,
      supplier_id: supplierId,
      purchase_id: purchaseId,
      quantity_received: Number(existingTargetBatch.quantity_received || 0) + totalIncomingQty,
      free_quantity: Number(existingTargetBatch.free_quantity || 0) + Number(item.free_stock_qty || 0),
      purchase_rate: item.purchase_rate_per_unit,
      mrp: item.mrp,
      selling_rate: item.selling_rate_per_unit,
      sales_discount_percent:
        item.sales_discount_percent !== undefined
          ? item.sales_discount_percent
          : existingTargetBatch.sales_discount_percent,
      gst_percent: item.gst_percent,
      purchase_unit: item.purchase_unit || existingTargetBatch.purchase_unit || "unit",
      sale_unit: item.sale_unit || existingTargetBatch.sale_unit || "unit",
      units_per_purchase_unit: item.units_per_purchase_unit || 1,
      purchase_pack_qty: Number(existingTargetBatch.purchase_pack_qty || 0) + Number(item.purchase_pack_qty || 0),
      free_pack_qty: Number(existingTargetBatch.free_pack_qty || 0) + Number(item.free_pack_qty || 0),
    });
  } else {
    const batchPayload: Record<string, any> = {
      organization_id: organizationId,
      product_id: item.product_id,
      batch_number: cleanBatchNumber,
      expiry_date: item.expiry_date || defaultPendingExpiryDate(),
      supplier_id: supplierId,
      purchase_id: purchaseId,
      quantity_received: totalIncomingQty,
      free_quantity: Number(item.free_stock_qty || 0),
      current_stock: remainingNetStock,
      stock_unit_qty: remainingNetStock,
      purchase_rate: item.purchase_rate_per_unit,
      mrp: item.mrp,
      selling_rate: item.selling_rate_per_unit,
      sales_discount_percent: item.sales_discount_percent ?? null,
      gst_percent: item.gst_percent || 0,
      purchase_unit: item.purchase_unit || "unit",
      sale_unit: item.sale_unit || "unit",
      units_per_purchase_unit: item.units_per_purchase_unit || 1,
      purchase_pack_qty: Number(item.purchase_pack_qty || 0),
      free_pack_qty: Number(item.free_pack_qty || 0),
    };

    const { data: createdBatch, error: batchErr } = await supabase
      .from("medicine_batches")
      .insert(batchPayload)
      .select("id")
      .single();

    if (batchErr || !createdBatch) {
      throw new Error(`Batch save failed for ${cleanBatchNumber}: ${batchErr?.message || "No batch returned"}`);
    }
    targetBatchId = createdBatch.id;
    finalBatchStock = remainingNetStock;
  }

  // 4. Insert purchase_items row
  const purchaseItemPayload: Record<string, any> = {
    organization_id: organizationId,
    purchase_id: purchaseId,
    product_id: item.product_id,
    batch_id: targetBatchId,
    quantity: totalIncomingQty,
    free_quantity: 0,
    rate: item.purchase_rate_per_unit,
    gst_percent: item.gst_percent || 0,
    discount: item.discount_amount || 0,
    line_total: item.line_total,
    purchase_unit: item.purchase_unit || "unit",
    sale_unit: item.sale_unit || "unit",
    units_per_purchase_unit: item.units_per_purchase_unit || 1,
    purchase_pack_qty: Number(item.purchase_pack_qty || 0),
    free_pack_qty: Number(item.free_pack_qty || 0),
    stock_unit_qty: totalIncomingQty,
    purchase_rate_per_unit: item.purchase_rate_per_unit,
  };

  const { error: itemErr } = await supabase.from("purchase_items").insert(purchaseItemPayload);
  if (itemErr) {
    throw new Error(`Purchase item save failed for ${cleanBatchNumber}: ${itemErr.message}`);
  }

  // 5. Insert stock_movements for the purchase and any cross-batch negative offset
  const baseBeforePurchase = existingTargetBatch ? getEffectiveStock(existingTargetBatch) : 0;
  const balanceAfterPurchaseIn = baseBeforePurchase + totalIncomingQty;

  await insertStockMovementSafe(supabase, {
    organization_id: organizationId,
    product_id: item.product_id,
    batch_id: targetBatchId,
    movement_type: "purchase",
    reference_type: "purchase",
    reference_id: purchaseId,
    reference_number: purchaseNo,
    in_quantity: totalIncomingQty,
    balance_quantity: balanceAfterPurchaseIn,
    created_by: createdBy,
  });

  if (crossBatchOffsetFilled > 0) {
    await insertStockMovementSafe(supabase, {
      organization_id: organizationId,
      product_id: item.product_id,
      batch_id: targetBatchId,
      movement_type: "adjustment_out",
      reference_type: "negative_stock_fill",
      reference_id: purchaseId,
      reference_number: purchaseNo,
      out_quantity: crossBatchOffsetFilled,
      balance_quantity: finalBatchStock,
      created_by: createdBy,
    });
  }

  // 6. Keep product master default rates up to date for future zero-stock billing
  await supabase
    .from("products")
    .update({
      mrp: item.mrp,
      selling_rate: item.selling_rate_per_unit,
      purchase_rate: item.purchase_rate_per_unit,
      gst_percent: item.gst_percent || 0,
    })
    .eq("id", item.product_id)
    .eq("organization_id", organizationId);

  return {
    batchId: targetBatchId,
    negativeOffsetFilled: totalNegativeOffsetFilled,
    offsetTotal: totalNegativeOffsetFilled,
    finalBatchStock,
  };
}

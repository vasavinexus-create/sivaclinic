import test from 'node:test';
import assert from 'node:assert/strict';

function parseSalesGstMode(raw) {
  if (!raw) return { mode: 'price_plus_gst', minDiscountValue: 0 };
  const parts = raw.split('|');
  const mode = parts[0] === 'price_only' ? 'price_only' : 'price_plus_gst';
  let minDiscountValue = 0;
  for (const part of parts.slice(1)) {
    if (part.startsWith('min_val:')) {
      minDiscountValue = Number(part.replace('min_val:', '')) || 0;
    }
  }
  return { mode, minDiscountValue };
}

function formatSalesGstMode(mode, minDiscountValue) {
  const cleanMode = mode === 'price_only' ? 'price_only' : 'price_plus_gst';
  return minDiscountValue > 0 ? `${cleanMode}|min_val:${minDiscountValue}` : cleanMode;
}

function discountedSaleRate(mrp, retailCount, discountPercent) {
  const units = Number(retailCount || 1) || 1;
  const rate = Number(mrp || 0) / units;
  const unitRate = rate > 0 ? Math.ceil(rate) : 0;
  const discount = unitRate * (Number(discountPercent || 0) / 100);
  return Math.max(0, Number((unitRate - discount).toFixed(2)));
}

function applyBillDiscountRule(cartItems, minBillThreshold) {
  if (!cartItems.length) return cartItems;
  const threshold = Number(minBillThreshold) || 0;

  const rawBillTotal = cartItems.reduce((sum, item) => {
    const unitPrice = Number(item.mrp_unit_rate || item.mrp || item.selling_rate || 0);
    return sum + unitPrice * Number(item.qty || 0);
  }, 0);

  const qualifies = threshold <= 0 || rawBillTotal >= threshold;

  return cartItems.map((item) => {
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

test('parseSalesGstMode parses mode and min_val correctly', () => {
  assert.deepEqual(parseSalesGstMode('price_plus_gst|min_val:5000'), {
    mode: 'price_plus_gst',
    minDiscountValue: 5000,
  });
  assert.deepEqual(parseSalesGstMode('price_only|min_val:1500'), {
    mode: 'price_only',
    minDiscountValue: 1500,
  });
  assert.deepEqual(parseSalesGstMode('price_plus_gst'), {
    mode: 'price_plus_gst',
    minDiscountValue: 0,
  });
  assert.deepEqual(parseSalesGstMode(null), {
    mode: 'price_plus_gst',
    minDiscountValue: 0,
  });
});

test('formatSalesGstMode encodes mode and min_val correctly', () => {
  assert.equal(formatSalesGstMode('price_plus_gst', 5000), 'price_plus_gst|min_val:5000');
  assert.equal(formatSalesGstMode('price_only', 0), 'price_only');
});

test('applyBillDiscountRule applies 0% discount when bill total is below minimum threshold', () => {
  const cart = [
    {
      name: '4.0',
      qty: 8,
      mrp_unit_rate: 310,
      sales_discount_percent: 0,
      original_sales_discount_percent: 0,
      configured_discount_percent: 0,
      selling_rate: 310,
      rate_edited: false,
    },
    {
      name: 'ALMOX 500',
      qty: 6,
      mrp_unit_rate: 7,
      sales_discount_percent: 20,
      original_sales_discount_percent: 20,
      configured_discount_percent: 20,
      selling_rate: 5.6,
      rate_edited: false,
    },
  ];

  // Raw bill total: 8 * 310 + 6 * 7 = 2480 + 42 = 2522
  // Threshold: 5000 -> Below threshold, should apply 0% discount to ALMOX 500
  const result = applyBillDiscountRule(cart, 5000);
  assert.equal(result[1].sales_discount_percent, 0);
  assert.equal(result[1].selling_rate, 7);
  assert.equal(result[0].sales_discount_percent, 0);
  assert.equal(result[0].selling_rate, 310);
});

test('applyBillDiscountRule restores configured discount when bill total reaches minimum threshold', () => {
  const cart = [
    {
      name: '4.0',
      qty: 17, // 17 * 310 = 5270
      mrp_unit_rate: 310,
      sales_discount_percent: 0,
      original_sales_discount_percent: 0,
      configured_discount_percent: 0,
      selling_rate: 310,
      rate_edited: false,
    },
    {
      name: 'ALMOX 500',
      qty: 6,
      mrp_unit_rate: 7,
      sales_discount_percent: 0,
      original_sales_discount_percent: 20,
      configured_discount_percent: 20,
      selling_rate: 7,
      rate_edited: false,
    },
  ];

  // Raw bill total: 17 * 310 + 6 * 7 = 5270 + 42 = 5312 >= 5000
  const result = applyBillDiscountRule(cart, 5000);
  assert.equal(result[1].sales_discount_percent, 20);
  assert.equal(result[1].selling_rate, 5.6);
});

test('applyBillDiscountRule preserves manual cashier rate override', () => {
  const cart = [
    {
      name: 'ALMOX 500',
      qty: 6,
      mrp_unit_rate: 7,
      sales_discount_percent: 10, // Cashier manually typed 10%
      original_sales_discount_percent: 20,
      configured_discount_percent: 20,
      selling_rate: 6.3,
      rate_edited: true, // Manual edit flag set
    },
  ];

  const result = applyBillDiscountRule(cart, 5000);
  assert.equal(result[0].sales_discount_percent, 10);
  assert.equal(result[0].selling_rate, 6.3);
});

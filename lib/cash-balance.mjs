// Receipts can appear in both payments and cash_ledger (inpatient collections).
export function cashBookEntries(payments, entries) {
  const receipts = new Map();
  for (const payment of payments) {
    receipts.set(payment.id, Number(payment.amount || 0));
    if (payment.sale_id) receipts.set(payment.sale_id, (receipts.get(payment.sale_id) || 0) + Number(payment.amount || 0));
  }
  return entries.filter((entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.entry_type === "receipt" && ["sale", "payment", "inpatient_payment"].includes(entry.reference_type)
      && receipts.get(entry.reference_id) === amount) return false;
    return true;
  });
}

export function cashBalance(payments, entries) {
  return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    + cashBookEntries(payments, entries).reduce((sum, entry) => sum + (entry.entry_type === "receipt" ? Number(entry.amount || 0) : -Number(entry.amount || 0)), 0);
}

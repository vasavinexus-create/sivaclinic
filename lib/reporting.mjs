import { cashBookEntries } from './cash-balance.mjs';

export const activeBill = (bill) => Boolean(bill && bill.status !== 'cancelled' && bill.status !== 'draft');
export const receivedUnits = (item) => item.stock_unit_qty != null
  ? Number(item.stock_unit_qty)
  : Number(item.quantity || 0) + Number(item.free_quantity || 0);
export const soldUnits = (item) => Number(item.quantity || 0) - Number(item.returned_quantity || 0);
export function businessDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function cashStatement(payments, ledger, from, to, mode = 'cash') {
  const cashPayments = payments.filter(p => mode === 'bank' ? p.mode !== 'cash' : p.mode === mode);
  const entries = [
    ...cashPayments.map(p => ({ id: p.id, date: businessDate(p.paid_at), timestamp: p.paid_at, particulars: `Receipt ${p.sale?.invoice_no || ''}`, receipt: Number(p.amount), payment: 0 })),
    ...cashBookEntries(cashPayments, ledger.filter(l => mode === 'bank' ? l.payment_mode !== 'cash' : l.payment_mode === mode)).map(l => ({ id: l.id, date: businessDate(l.occurred_at), timestamp: l.occurred_at, particulars: l.category || l.reference_type, receipt: l.entry_type === 'receipt' ? Number(l.amount) : 0, payment: l.entry_type === 'payment' ? Number(l.amount) : 0 })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  let balance = 0, opening = 0;
  const rows = [];
  for (const row of entries) {
    if (row.date > to) continue;
    balance += row.receipt - row.payment;
    if (row.date < from) opening = balance;
    else rows.push({ ...row, balance });
  }
  return { rows, opening, closing: balance };
}

const systemGroups = {
  Cash: 'asset', Bank: 'asset', Inventory: 'asset', 'Inventory Stock': 'asset',
  'Patient Receivable': 'asset', 'Accounts Receivable': 'asset', 'Supplier Payable': 'liability',
  'GST Payable': 'liability', 'Output GST': 'liability', 'Input GST': 'asset',
  'Pharmacy Sales': 'income', 'Doctor Fees': 'income', 'Doctor Fee Income': 'income',
  'Consultation Revenue': 'income', Sales: 'income', 'Cost of Goods Sold': 'expense', Purchase: 'asset',
};
export function journalReport(journals, ledgers) {
  return journals.filter(j => j.status === 'posted').flatMap(j => (j.journal_lines || []).map((line, i) => {
    const ledger = ledgers.find(l => line.account_ledger_id ? l.id === line.account_ledger_id : l.name === line.ledger_name);
    return { id: `${j.id}-${i}`, date: j.entry_date, ledger: line.ledger_name,
      ledgerId: ledger?.id, group: ledger?.group?.group_type || systemGroups[line.ledger_name] || (j.voucher_type === 'expense' && Number(line.debit) > 0 ? 'expense' : 'unclassified'),
      voucher: j.voucher_no, particulars: j.narration || j.reference_number || '',
      debit: Number(line.debit || 0), credit: Number(line.credit || 0) };
  }));
}

export function ledgerBalances(rows, ledgers) {
  const balances = new Map();
  for (const l of ledgers) balances.set(l.id, { id: l.id, ledger: l.name, group: l.group?.group_type || systemGroups[l.name] || 'unclassified', balance: Number(l.opening_balance || 0) * (l.opening_type === 'credit' ? -1 : 1) });
  for (const row of rows) {
    const key = row.ledgerId || row.ledger;
    if (!balances.has(key)) balances.set(key, { id: key, ledger: row.ledger, group: row.group, balance: 0 });
    balances.get(key).balance += row.debit - row.credit;
  }
  return [...balances.values()];
}

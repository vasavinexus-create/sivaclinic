# -*- coding: utf-8 -*-
import codecs

with codecs.open('lib/reporting.mjs', 'r', 'utf-8') as f:
    code = f.read()

search = """export function cashStatement(payments, ledger, from, to) {
  const cashPayments = payments.filter(p => p.mode === 'cash');
  const entries = [
    ...cashPayments.map(p => ({ id: p.id, date: businessDate(p.paid_at), timestamp: p.paid_at, particulars: `Receipt ${p.sale?.invoice_no || ''}`, receipt: Number(p.amount), payment: 0 })),
    ...cashBookEntries(cashPayments, ledger.filter(l => l.payment_mode === 'cash')).map(l => ({ id: l.id, date: businessDate(l.occurred_at), timestamp: l.occurred_at, particulars: l.category || l.reference_type, receipt: l.entry_type === 'receipt' ? Number(l.amount) : 0, payment: l.entry_type === 'payment' ? Number(l.amount) : 0 })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));"""

replace = """export function cashStatement(payments, ledger, from, to, mode = 'cash') {
  const cashPayments = payments.filter(p => mode === 'bank' ? p.mode !== 'cash' : p.mode === mode);
  const entries = [
    ...cashPayments.map(p => ({ id: p.id, date: businessDate(p.paid_at), timestamp: p.paid_at, particulars: `Receipt ${p.sale?.invoice_no || ''}`, receipt: Number(p.amount), payment: 0 })),
    ...cashBookEntries(cashPayments, ledger.filter(l => mode === 'bank' ? l.payment_mode !== 'cash' : l.payment_mode === mode)).map(l => ({ id: l.id, date: businessDate(l.occurred_at), timestamp: l.occurred_at, particulars: l.category || l.reference_type, receipt: l.entry_type === 'receipt' ? Number(l.amount) : 0, payment: l.entry_type === 'payment' ? Number(l.amount) : 0 })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));"""

if search in code:
    code = code.replace(search, replace)
    with codecs.open('lib/reporting.mjs', 'w', 'utf-8') as f:
        f.write(code)
    print("Replaced cashStatement")
else:
    print("Could not find cashStatement")

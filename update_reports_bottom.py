# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

# I need to replace the if/else block starting from `if (view === "Cash Ledger") {`
# to `const pages = Math.max(1, Math.ceil(rows.length / 50));`

start_idx = code.find('if (view === "Cash Ledger") {')
end_idx = code.find('const pages = Math.max(1, Math.ceil(rows.length / 50));')

if start_idx == -1 or end_idx == -1:
    print("Could not find boundaries")
    exit(1)

new_logic = """
  const bank = cashStatement(data.payments, data.cash, from, to, 'bank');
  
  if (view === "Cash Book" || view === "Cash Ledger") {
    rows = cash.rows;
    columns = [["date", "Date"], ["particulars", "Particulars"], ["receipt", "Receipt"], ["payment", "Payment"], ["balance", "Running balance"]];
    summaries = [["Opening balance", cash.opening], ["Receipts", rows.reduce((s, r) => s + r.receipt, 0)], ["Payments", rows.reduce((s, r) => s + r.payment, 0)], ["Closing balance", cash.closing]];
  } else if (view === "Bank Book") {
    rows = bank.rows;
    columns = [["date", "Date"], ["particulars", "Particulars"], ["receipt", "Receipt"], ["payment", "Payment"], ["balance", "Running balance"]];
    summaries = [["Opening balance", bank.opening], ["Receipts", rows.reduce((s, r) => s + r.receipt, 0)], ["Payments", rows.reduce((s, r) => s + r.payment, 0)], ["Closing balance", bank.closing]];
  } else if (view === "Ledger Statement" || view === "Ledger Report") {
    const master = data.ledgers.find(l => l.name === selectedLedger);
    let running = Number(master?.opening_balance || 0) * (master?.opening_type === "credit" ? -1 : 1);
    journal.filter((r: Row) => r.ledger === selectedLedger && r.date < from).forEach((r: Row) => { running += r.debit - r.credit; });
    const opening = running;
    rows = period.filter((r: Row) => r.ledger === selectedLedger).map((r: Row) => { running += r.debit - r.credit; return { ...r, balance: running }; });
    columns = [...columns.filter(([key]) => key !== "ledger"), ["balance", "Running balance"]];
    summaries = [["Opening (debit - credit)", opening], ["Closing (debit - credit)", running]];
  } else if (view === "Sales Account") {
    rows = period.filter((r: Row) => r.group === "income");
    summaries = [["Net income", income]];
  } else if (view === "Reports" || view === "Sales Report") {
    rows = data.sales.map(s => ({ ...s, date: businessDate(s.sold_at) }));
    columns = [["date", "Date"], ["invoice_no", "Invoice"], ["pharmacy_revenue", "Pharmacy revenue"], ["doctor_fee", "Doctor fee"], ["grand_total", "Bill total"], ["payment_mode", "Payment mode"], ["status", "Status"]];
    summaries = [["Active bill total", rows.reduce((sum, r) => sum + Number(r.grand_total), 0)]];
  } else if (view === "Profit & Loss") {
    rows = ["income", "expense"].flatMap(group => {
      const byLedger = new Map<string, number>();
      period.filter((r: Row) => r.group === group).forEach((r: Row) => byLedger.set(r.ledger, (byLedger.get(r.ledger) || 0) + (group === "income" ? r.credit - r.debit : r.debit - r.credit)));
      return [...byLedger].map(([name, amount]) => ({ id: name, ledger: name, group, amount }));
    });
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Amount"]];
    summaries = [["Income", income], ["Expenses", expenses], ["Net profit / loss", income - expenses]];
  } else if (view === "Expense Report") {
    rows = period.filter((r: Row) => r.group === "expense");
    summaries = [["Total Expenses", expenses]];
  } else if (view === "Purchase Report") {
    rows = (data.purchases || []).map(p => ({ ...p, date: businessDate(p.invoice_date), supplier_name: p.supplier?.name || '-' }));
    columns = [["date", "Date"], ["purchase_no", "Purchase No"], ["supplier_name", "Supplier"], ["grand_total", "Total"], ["status", "Status"]];
    summaries = [["Total Purchases", rows.reduce((sum, r) => sum + Number(r.grand_total), 0)]];
  } else if (view === "Trial Balance") {
    rows = [...new Set([...data.ledgers.map(l => l.name), ...journal.map((l: Row) => l.ledger)])].map(name => {
      const lines = period.filter((r: Row) => r.ledger === name);
      const debit = lines.reduce((s, r) => s + r.debit, 0);
      const credit = lines.reduce((s, r) => s + r.credit, 0);
      const master = data.ledgers.find(l => l.name === name);
      const open = Number(master?.opening_balance || 0) * (master?.opening_type === "credit" ? -1 : 1);
      return { id: name, ledger: name, debit, credit, balance: open + debit - credit };
    });
    columns = [["ledger", "Ledger"], ["debit", "Debit"], ["credit", "Credit"], ["balance", "Closing Balance"]];
    summaries = [["Total Debit", rows.reduce((s, r) => s + r.debit, 0)], ["Total Credit", rows.reduce((s, r) => s + r.credit, 0)]];
  } else if (view === "Receivables Report" || view === "Outstanding Report") {
    rows = balances.filter(r => r.group === "asset" && r.ledger.toLowerCase().includes("receivable"));
    columns = [["ledger", "Ledger"], ["balance", "Amount Due"]];
    summaries = [["Total Receivables", rows.reduce((s, r) => s + r.balance, 0)]];
  } else if (view === "Payables Report") {
    rows = balances.filter(r => r.group === "liability" && r.ledger.toLowerCase().includes("payable"));
    columns = [["ledger", "Ledger"], ["balance", "Amount Owed"]];
    summaries = [["Total Payables", Math.abs(rows.reduce((s, r) => s + r.balance, 0))]];
  } else if (view === "GST Report") {
    rows = period.filter((r: Row) => r.ledger.toLowerCase().includes("gst"));
    columns = [["date", "Date"], ["ledger", "Ledger"], ["particulars", "Particulars"], ["debit", "Debit (Paid)"], ["credit", "Credit (Collected)"]];
    summaries = [["GST Collected", rows.reduce((s, r) => s + r.credit, 0)], ["GST Paid", rows.reduce((s, r) => s + r.debit, 0)]];
  } else if (view === "Balance Sheet") {
    rows = balances.filter((r: Row) => !["income", "expense"].includes(r.group)).map((r: Row) => ({ ...r, amount: ["liability", "equity"].includes(r.group) ? -r.balance : r.balance }));
    const retained = -balanceTotal("income") - balanceTotal("expense");
    rows.push({ id: "retained-earnings", ledger: "Current earnings", group: "equity", amount: retained });
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Balance"]];
    summaries = [["Assets", balanceTotal("asset")], ["Liabilities", -balanceTotal("liability")], ["Equity and earnings", -balanceTotal("equity") + retained], ["Unreconciled difference", balanceTotal("asset") + balanceTotal("liability") + balanceTotal("equity") - retained]];
  } else if (view === "Current Balance") {
    rows = balances;
    columns = [["ledger", "Ledger"], ["group", "Type"], ["balance", "Balance (debit - credit)"]];
    summaries = [["Cash as of end date", cash.closing], ["Supplier payable as of end date", data.supplier.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)], ["Live inventory value", data.batches.reduce((s, r) => s + Number(r.current_stock) * Number(r.purchase_rate), 0)]];
  }
  
  """

new_code = code[:start_idx] + new_logic + code[end_idx:]

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(new_code)

print("Done updating bottom half")

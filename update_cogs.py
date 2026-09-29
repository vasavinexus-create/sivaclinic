# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

# 1. Update setData signature
code = code.replace(
    'const [data, setData] = useState<Record<string, Row[]>>({ journals: [], ledgers: [], sales: [], payments: [], cash: [], batches: [], supplier: [], purchases: [] });',
    'const [data, setData] = useState<Record<string, Row[]>>({ journals: [], ledgers: [], sales: [], payments: [], cash: [], batches: [], supplier: [], purchases: [], saleItems: [] });'
)

# 2. Add sale_items to Promise.all
code = code.replace(
    'readAll(() => query("purchases", "id,purchase_no,invoice_date,invoice_total,status,supplier:suppliers(name)").neq("status", "cancelled").gte("invoice_date", `${from}`).lte("invoice_date", end).order("invoice_date").order("id")),',
    'readAll(() => query("purchases", "id,purchase_no,invoice_date,invoice_total,status,supplier:suppliers(name)").neq("status", "cancelled").gte("invoice_date", `${from}`).lte("invoice_date", end).order("invoice_date").order("id")),\n        readAll(() => query("sale_items", "id,quantity,sale:sales!inner(status,sold_at),batch:medicine_batches(purchase_rate)").neq("sale.status", "cancelled").gte("sale.sold_at", `${from}T00:00:00+05:30`).lte("sale.sold_at", end).order("id")),'
)

# 3. Update then() arguments
code = code.replace(
    ']).then(([journals, ledgers, sales, payments, cash, batches, supplier, purchases]) => {',
    ']).then(([journals, ledgers, sales, payments, cash, batches, supplier, purchases, saleItems]) => {'
)
code = code.replace(
    'if (alive) setData({ journals, ledgers, sales, payments, cash, batches, supplier, purchases });',
    'if (alive) setData({ journals, ledgers, sales, payments, cash, batches, supplier, purchases, saleItems });'
)

# 4. Update Profit & Loss logic
pnl_search = """} else if (view === "Profit & Loss") {
    rows = ["income", "expense"].flatMap(group => {
      const byLedger = new Map<string, number>();
      period.filter((r: Row) => r.group === group).forEach((r: Row) => byLedger.set(r.ledger, (byLedger.get(r.ledger) || 0) + (group === "income" ? r.credit - r.debit : r.debit - r.credit)));
      return [...byLedger].map(([name, amount]) => ({ id: name, ledger: name, group, amount }));
    });
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Amount"]];
    summaries = [["Income", income], ["Expenses", expenses], ["Net profit / loss", income - expenses]];"""

pnl_replace = """} else if (view === "Profit & Loss") {
    const cogsValue = (data.saleItems || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.batch?.purchase_rate || 0)), 0);
    rows = ["income", "expense"].flatMap(group => {
      const byLedger = new Map<string, number>();
      period.filter((r: Row) => r.group === group).forEach((r: Row) => byLedger.set(r.ledger, (byLedger.get(r.ledger) || 0) + (group === "income" ? r.credit - r.debit : r.debit - r.credit)));
      return [...byLedger].map(([name, amount]) => ({ id: name, ledger: name, group, amount }));
    });
    if (cogsValue > 0) rows.push({ id: "cogs", ledger: "Cost of Goods Sold", group: "expense", amount: cogsValue });
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Amount"]];
    summaries = [["Income", income], ["Expenses (incl. COGS)", expenses + cogsValue], ["Net Profit / Loss", income - (expenses + cogsValue)]];"""

code = code.replace(pnl_search, pnl_replace)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Updated COGS for P&L")

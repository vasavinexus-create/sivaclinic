"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { readAll } from "../../lib/read-all";
import { businessDate, cashStatement, journalReport, ledgerBalances } from "../../lib/reporting.mjs";

type Row = Record<string, any>;
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value || 0);
const reportViews = ["Day Book", "Cash Book", "Bank Book", "Sales Report", "Purchase Report", "Expense Report", "Ledger Report", "Trial Balance", "Current Balance", "Balance Sheet", "Profit & Loss", "Receivables Report", "Payables Report", "GST Report", "Outstanding Report"];
export const isFinancialReport = (view: string) => reportViews.includes(view);

export default function FinancialReports({ view, organizationId }: { view: string; organizationId: string }) {
  const today = businessDate(new Date().toISOString());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [ledger, setLedger] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, Row[]>>({ journals: [], ledgers: [], sales: [], payments: [], cash: [], batches: [], supplier: [], purchases: [], saleItems: [] });

  useEffect(() => {
    let alive = true;
    if (!supabase) { setError("Database is not configured."); setLoading(false); return; }
    if (!from || !to || from > to) { setError("Choose a valid date range."); setLoading(false); return; }
    const client = supabase;
    setLoading(true);
    setError("");
    const query = (table: string, select: string) => client.from(table).select(select).eq("organization_id", organizationId);
    const end = `${to}T23:59:59.999999+05:30`;
    // Date and tenant filters run in Postgres. Stable paging avoids the API row limit.
    Promise.all([
      readAll(() => query("journal_entries", "id,voucher_no,voucher_type,entry_date,narration,reference_number,status,journal_lines(ledger_name,debit,credit,account_ledger_id)").eq("status", "posted").lte("entry_date", to).order("entry_date").order("id")),
      readAll(() => query("account_ledgers", "id,name,opening_balance,opening_type,group:ledger_groups(group_type)").order("id")),
      readAll(() => query("sales", "id,invoice_no,sold_at,pharmacy_revenue,doctor_fee,grand_total,payment_mode,status").neq("status", "cancelled").gte("sold_at", `${from}T00:00:00+05:30`).lte("sold_at", end).order("sold_at").order("id")),
      readAll(() => query("payments", "id,sale_id,paid_at,amount,mode,sale:sales(invoice_no)").lte("paid_at", end).order("paid_at").order("id")),
      readAll(() => query("cash_ledger", "id,occurred_at,entry_type,category,reference_type,reference_id,amount,payment_mode").lte("occurred_at", end).order("occurred_at").order("id")),
      readAll(() => query("medicine_batches", "id,current_stock,purchase_rate").order("id")),
      readAll(() => query("supplier_ledger", "id,debit,credit").lte("occurred_on", to).order("id")),
        readAll(() => query("purchases", "id,purchase_no,invoice_date,invoice_total,status,supplier:suppliers(name)").neq("status", "cancelled").gte("invoice_date", `${from}`).lte("invoice_date", end).order("invoice_date").order("id")),
        readAll(() => query("sale_items", "id,quantity,sale:sales!inner(status,sold_at),batch:medicine_batches(purchase_rate)").neq("sale.status", "cancelled").gte("sale.sold_at", `${from}T00:00:00+05:30`).lte("sale.sold_at", end).order("id")),
    ]).then(([journals, ledgers, sales, payments, cash, batches, supplier, purchases, saleItems]) => {
      if (alive) setData({ journals, ledgers, sales, payments, cash, batches, supplier, purchases, saleItems });
    }).catch(e => { if (alive) setError(e.message || "Report could not be loaded."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [organizationId, from, to, revision]);

  useEffect(() => { setPage(1); }, [view, from, to, ledger]);
  const journal = useMemo(() => journalReport(data.journals, data.ledgers), [data]);
  const period = journal.filter((r: Row) => r.date >= from && r.date <= to);
  const balances = ledgerBalances(journal, data.ledgers);
  const cash = cashStatement(data.payments, data.cash, from, to);
  const names: string[] = Array.from(new Set([...data.ledgers.map(l => l.name), ...journal.map((l: Row) => l.ledger)]));
  const selectedLedger = names.includes(ledger) ? ledger : names[0] || "";
  const balanceTotal = (group: string) => balances.filter((r: Row) => r.group === group).reduce((sum: number, r: Row) => sum + r.balance, 0);
  const income = -period.filter((r: Row) => r.group === "income").reduce((s: number, r: Row) => s + r.debit - r.credit, 0);
  const expenses = period.filter((r: Row) => r.group === "expense").reduce((s: number, r: Row) => s + r.debit - r.credit, 0);
  let rows: Row[] = period;
  let columns: [string, string][] = [["date", "Date"], ["ledger", "Ledger"], ["voucher", "Voucher"], ["particulars", "Particulars"], ["debit", "Debit"], ["credit", "Credit"]];
  let summaries: [string, number][] = [];
  
  const bank = cashStatement(data.payments, data.cash, from, to, 'bank');
  
  if (view === "Day Book") {
    summaries = [["Total Debits", rows.reduce((s: number, r: Row) => s + Number(r.debit), 0)], ["Total Credits", rows.reduce((s: number, r: Row) => s + Number(r.credit), 0)]];
  } else if (view === "Cash Book" || view === "Daily Cash Book" || view === "Cash Ledger") {
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
  } else if (view === "Reports" || view === "Sales Report" || view === "Sales/Billing Report") {
    rows = data.sales.map(s => ({ ...s, date: businessDate(s.sold_at) }));
    columns = [["date", "Date"], ["invoice_no", "Invoice"], ["pharmacy_revenue", "Pharmacy revenue"], ["doctor_fee", "Doctor fee"], ["grand_total", "Bill total"], ["payment_mode", "Payment mode"], ["status", "Status"]];
    summaries = [["Active bill total", rows.reduce((sum, r) => sum + Number(r.grand_total), 0)]];
  } else if (view === "Profit & Loss") {
    const cogsValue = (data.saleItems || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.batch?.purchase_rate || 0)), 0);
    rows = ["income", "expense"].flatMap(group => {
      const byLedger = new Map<string, number>();
      period.filter((r: Row) => r.group === group).forEach((r: Row) => byLedger.set(r.ledger, (byLedger.get(r.ledger) || 0) + (group === "income" ? r.credit - r.debit : r.debit - r.credit)));
      return [...byLedger].map(([name, amount]) => ({ id: name, ledger: name, group, amount }));
    });
    if (cogsValue > 0) rows.push({ id: "cogs", ledger: "Cost of Goods Sold", group: "expense", amount: cogsValue });
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Amount"]];
    summaries = [["Income", income], ["Expenses (incl. COGS)", expenses + cogsValue], ["Net Profit / Loss", income - (expenses + cogsValue)]];
  } else if (view === "Expense Report") {
    rows = period.filter((r: Row) => r.group === "expense");
    summaries = [["Total Expenses", expenses]];
  } else if (view === "Purchase Report") {
    rows = (data.purchases || []).map(p => ({ ...p, date: businessDate(p.invoice_date), supplier_name: p.supplier?.name || '-' }));
    columns = [["date", "Date"], ["purchase_no", "Purchase No"], ["supplier_name", "Supplier"], ["invoice_total", "Total"], ["status", "Status"]];
    summaries = [["Total Purchases", rows.reduce((sum, r) => sum + Number(r.invoice_total), 0)]];
  } else if (view === "Trial Balance") {
    rows = [...new Set([...data.ledgers.map(l => l.name), ...journal.map((l: Row) => l.ledger)])].map(name => {
      const lines = period.filter((r: Row) => r.ledger === name);
      const debit = lines.reduce((s: number, r: Row) => s + r.debit, 0);
      const credit = lines.reduce((s: number, r: Row) => s + r.credit, 0);
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
  } else if (view === "GST Report" || view === "GST/Tax Report") {
    rows = period.filter((r: Row) => r.ledger.toLowerCase().includes("gst"));
    columns = [["date", "Date"], ["ledger", "Ledger"], ["particulars", "Particulars"], ["debit", "Debit (Paid)"], ["credit", "Credit (Collected)"]];
    summaries = [["GST Collected", rows.reduce((s, r) => s + r.credit, 0)], ["GST Paid", rows.reduce((s, r) => s + r.debit, 0)]];
  } else if (view === "Balance Sheet") {
    const cogsValue = (data.saleItems || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.batch?.purchase_rate || 0)), 0);
    
    rows = balances.filter((r: Row) => !["income", "expense"].includes(r.group)).map((r: Row) => ({ ...r, amount: ["liability", "equity"].includes(r.group) ? -r.balance : r.balance }));
    
    // Inject COGS as a reduction to Assets (Contra-Asset)
    if (cogsValue > 0) {
      rows.push({ id: "cogs-contra", ledger: "Cost of Goods Sold (Stock Out)", group: "asset", amount: -cogsValue });
    }

    // Retained earnings must also reflect the COGS expense we added to the P&L
    const retained = -balanceTotal("income") - balanceTotal("expense") - cogsValue;
    rows.push({ id: "retained-earnings", ledger: "Current earnings", group: "equity", amount: retained });
    
    const adjustedAssets = balanceTotal("asset") - cogsValue;
    const adjustedEquity = -balanceTotal("equity") + retained;
    
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Balance"]];
    summaries = [
      ["Assets", adjustedAssets], 
      ["Liabilities", -balanceTotal("liability")], 
      ["Equity and earnings", adjustedEquity], 
      ["Unreconciled difference", adjustedAssets - (-balanceTotal("liability") + adjustedEquity)]
    ];
  } else if (view === "Current Balance") {
    rows = balances;
    columns = [["ledger", "Ledger"], ["group", "Type"], ["balance", "Balance (debit - credit)"]];
    summaries = [["Cash as of end date", cash.closing], ["Supplier payable as of end date", data.supplier.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)], ["Live inventory value", data.batches.reduce((s, r) => s + Number(r.current_stock) * Number(r.purchase_rate), 0)]];
  }
  
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages);
  const moneyKeys = new Set(["debit", "credit", "receipt", "payment", "balance", "amount", "pharmacy_revenue", "doctor_fee", "grand_total", "invoice_total"]);

  const isDoubleColumn = ["Balance Sheet", "Profit & Loss", "Current Balance"].includes(view);
  const renderDualTable = () => {
    let leftTitle = "";
    let rightTitle = "";
    let leftRows: Row[] = [];
    let rightRows: Row[] = [];
    
    if (view === "Profit & Loss") {
        leftTitle = "Expenses";
        rightTitle = "Income";
        leftRows = rows.filter(r => r.group === "expense");
        rightRows = rows.filter(r => r.group === "income");
    } else if (view === "Balance Sheet") {
        leftTitle = "Liabilities & Equity";
        rightTitle = "Assets";
        leftRows = rows.filter(r => r.group === "liability" || r.group === "equity");
        rightRows = rows.filter(r => r.group === "asset");
    } else if (view === "Current Balance") {
        leftTitle = "Debit Balances";
        rightTitle = "Credit Balances";
        leftRows = rows.filter(r => r.balance > 0);
        rightRows = rows.filter(r => r.balance < 0);
    }
    
    const rowCount = Math.max(leftRows.length, rightRows.length);
    const combinedRows = Array.from({length: rowCount}).map((_, i) => {
       return { left: leftRows[i] || null, right: rightRows[i] || null };
    });
    
    const valKey = view === "Current Balance" ? "balance" : "amount";
    
    return <div className="data-wrap"><table className="data-table">
        <thead>
            <tr>
                <th style={{width: '35%'}}>{leftTitle} (Ledger)</th>
                <th style={{width: '15%', textAlign: "right"}}>Amount</th>
                <th style={{width: '35%', borderLeft: "2px solid #ddd"}}>{rightTitle} (Ledger)</th>
                <th style={{width: '15%', textAlign: "right"}}>Amount</th>
            </tr>
        </thead>
        <tbody>
            {combinedRows.map((r, i) => (
                <tr key={i}>
                    <td>{r.left ? String(r.left.ledger) : ""}</td>
                    <td style={{textAlign: "right"}}>{r.left ? money(Math.abs(Number(r.left[valKey]))) : ""}</td>
                    <td style={{borderLeft: "2px solid #ddd"}}>{r.right ? String(r.right.ledger) : ""}</td>
                    <td style={{textAlign: "right"}}>{r.right ? money(Math.abs(Number(r.right[valKey]))) : ""}</td>
                </tr>
            ))}
            <tr style={{fontWeight: "bold", background: "#f4f4f4"}}>
               <td>Total</td>
               <td style={{textAlign: "right"}}>{money(leftRows.reduce((s, r) => s + Math.abs(Number(r[valKey])), 0))}</td>
               <td style={{borderLeft: "2px solid #ddd"}}>Total</td>
               <td style={{textAlign: "right"}}>{money(rightRows.reduce((s, r) => s + Math.abs(Number(r[valKey])), 0))}</td>
            </tr>
        </tbody>
    </table></div>;
  };

  return <div><div className="page-head"><h1>{view}</h1><button className="secondary" onClick={() => setRevision(r => r + 1)} title="Refresh report"><RefreshCw size={16}/> Refresh</button></div>
    <div className="panel"><div className="v2-toolbar">
      <label className="field"><span>From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label>
      <label className="field"><span>To</span><input type="date" value={to} onChange={e => setTo(e.target.value)}/></label>
      {(view === "Ledger Statement" || view === "Ledger Report") && <label className="field"><span>Ledger</span><select value={selectedLedger} onChange={e => setLedger(e.target.value)}>{names.map(n => <option key={n}>{n}</option>)}</select></label>}
    </div>
    {loading ? <div className="loading-panel">Loading report...</div> : error ? <div role="alert" className="error-box">{error}</div> : <>
      {!!summaries.length && <section className="summary-strip">{summaries.map(([label, amount]) => <div className="summary-card" key={label}><span>{label}</span><strong>{money(amount)}</strong></div>)}</section>}
      {journal.some((r: Row) => r.group === "unclassified") && ["Balance Sheet", "Profit & Loss", "Current Balance"].includes(view) && <div role="alert" className="auth-message">Unclassified journal ledgers exist. Assign their account groups before relying on these totals.</div>}
      {rows.length ? (isDoubleColumn ? renderDualTable() : <div className="data-wrap"><table className="data-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.slice((currentPage - 1) * 50, currentPage * 50).map((row, index) => <tr key={row.id || index}>{columns.map(([key]) => <td key={key}>{moneyKeys.has(key) ? money(Number(row[key])) : String(row[key] ?? "-")}</td>)}</tr>)}</tbody></table></div>) : <div className="empty">No records for this period.</div>}
      <div className="pagination-bar"><span>{rows.length} records</span><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</button><span>Page {currentPage} / {pages}</span><button className="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    </>}
    </div></div>;
}

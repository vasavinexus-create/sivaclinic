# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('lib/reporting.mjs', 'r', 'utf-8') as f:
    code = f.read()

# Add Purchase to systemGroups
if "Purchase: 'asset'" not in code:
    code = code.replace(
        "'Consultation Revenue': 'income', Sales: 'income', 'Cost of Goods Sold': 'expense',",
        "'Consultation Revenue': 'income', Sales: 'income', 'Cost of Goods Sold': 'expense', Purchase: 'asset',"
    )
    with codecs.open('lib/reporting.mjs', 'w', 'utf-8') as f:
        f.write(code)
    print("Updated systemGroups in reporting.mjs")


with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

bs_search = """} else if (view === "Balance Sheet") {
    rows = balances.filter((r: Row) => !["income", "expense"].includes(r.group)).map((r: Row) => ({ ...r, amount: ["liability", "equity"].includes(r.group) ? -r.balance : r.balance }));
    const retained = -balanceTotal("income") - balanceTotal("expense");
    rows.push({ id: "retained-earnings", ledger: "Current earnings", group: "equity", amount: retained });
    columns = [["ledger", "Ledger"], ["group", "Type"], ["amount", "Balance"]];
    summaries = [["Assets", balanceTotal("asset")], ["Liabilities", -balanceTotal("liability")], ["Equity and earnings", -balanceTotal("equity") + retained], ["Unreconciled difference", balanceTotal("asset") + balanceTotal("liability") + balanceTotal("equity") - retained]];
  }"""

bs_replace = """} else if (view === "Balance Sheet") {
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
  }"""

if bs_search in code:
    code = code.replace(bs_search, bs_replace)
    with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
        f.write(code)
    print("Updated Balance Sheet in FinancialReports")
else:
    print("Could not find Balance Sheet logic")

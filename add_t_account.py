# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/components/FinancialReports.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Add the renderDualTable function right before the return statement
render_dual = """
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

  return <div><div className="page-head">"""

code = code.replace('  return <div><div className="page-head">', render_dual)

# Replace the table rendering in the JSX
table_search = '{rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.slice((currentPage - 1) * 50, currentPage * 50).map((row, index) => <tr key={row.id || index}>{columns.map(([key]) => <td key={key}>{moneyKeys.has(key) ? money(Number(row[key])) : String(row[key] ?? "-")}</td>)}</tr>)}</tbody></table></div> : <div className="empty">No records for this period.</div>}'
table_replace = '{rows.length ? (isDoubleColumn ? renderDualTable() : <div className="data-wrap"><table className="data-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.slice((currentPage - 1) * 50, currentPage * 50).map((row, index) => <tr key={row.id || index}>{columns.map(([key]) => <td key={key}>{moneyKeys.has(key) ? money(Number(row[key])) : String(row[key] ?? "-")}</td>)}</tr>)}</tbody></table></div>) : <div className="empty">No records for this period.</div>}'

code = code.replace(table_search, table_replace)

with codecs.open('app/components/FinancialReports.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Added double-column layout")

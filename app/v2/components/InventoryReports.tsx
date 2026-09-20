"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { money } from "../lib/format";
import { Profile, Row } from "../lib/types";
import { AsyncSelect } from "./controls";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function endOfDay(value: string) {
  return `${value}T23:59:59.999`;
}

export function MedicineSalesWorkflow({ profile }: { profile: Profile }) {
  const [from, setFrom] = useState(todayInput());
  const [to, setTo] = useState(todayInput());
  const [productId, setProductId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase) return;
      setLoading(true);
      const sales = await supabase.from("sales").select("id").eq("organization_id", profile.organization_id).gte("sold_at", `${from}T00:00:00`).lte("sold_at", endOfDay(to)).eq("status", "completed");
      if (!alive) return;
      if (sales.error) {
        setError(sales.error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      const ids = (sales.data || []).map((sale) => sale.id);
      if (!ids.length) {
        setRows([]);
        setError("");
        setLoading(false);
        return;
      }
      let query = supabase.from("sale_items").select("product_id,quantity,unit_rate,line_total,product:products(product_id,name)").in("sale_id", ids);
      if (productId) query = query.eq("product_id", productId);
      const items = await query;
      if (!alive) return;
      const grouped = new Map<string, Row>();
      (items.data || []).forEach((item: any) => {
        const key = item.product_id;
        const quantity = Number(item.quantity || 0);
        const amount = Number(item.line_total || 0);
        const row = grouped.get(key) || { product_id: item.product?.product_id, medicine: item.product?.name, quantity: 0, amount: 0 };
        row.quantity += quantity;
        row.amount += amount;
        row.average_rate = row.quantity ? row.amount / row.quantity : 0;
        grouped.set(key, row);
      });
      setRows(Array.from(grouped.values()).sort((a, b) => Number(b.amount) - Number(a.amount)));
      setError(items.error?.message || "");
      setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [from, to, productId, profile.organization_id]);

  const totalQty = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return <div>
    <div className="page-head"><div><h1>Medicine Sales</h1><p>Medicine-wise quantity, average rate and sale amount for the selected date range.</p></div></div>
    <div className="panel">
      <div className="v2-toolbar">
        <label className="field compact-field"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)}/></label>
        <label className="field compact-field"><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)}/></label>
        <AsyncSelect table="products" select="id,product_id,name" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine filter" value={productId} onChange={(id) => setProductId(id)} render={(row) => `${row.product_id} - ${row.name}`} placeholder="All medicines"/>
        <button type="button" className="secondary" onClick={() => setProductId("")}><X size={15}/> Clear</button>
      </div>
      <section className="summary-strip"><div className="panel summary-card"><span>Medicines sold</span><strong>{rows.length}</strong><small>{productId ? "Selected medicine" : "Unique medicines"}</small></div><div className="panel summary-card"><span>Total quantity</span><strong>{totalQty}</strong><small>Units sold</small></div><div className="panel summary-card"><span>Total sale</span><strong>{money(totalAmount)}</strong><small>Before doctor fee</small></div></section>
      {error ? <div className="error-box">{error}</div> : loading ? <div className="loading-panel">Loading from database...</div> : rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Medicine ID</th><th>Medicine</th><th>Qty sold</th><th>Average rate</th><th>Total amount</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product_id}><td>{row.product_id}</td><td>{row.medicine}</td><td>{row.quantity}</td><td>{money(row.average_rate)}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No medicine sales found.</h3><p>Try another date range or clear filter.</p></div>}
    </div>
  </div>;
}

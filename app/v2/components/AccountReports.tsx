"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { postJournal } from "../lib/accounting";
import { money } from "../lib/format";
import { Profile, Row } from "../lib/types";
import { Field } from "./controls";

export function AccountReportWorkflow({ view, profile }: { view: string; profile: Profile }) {
  const [stats, setStats] = useState({ sales: 0, expenses: 0, purchases: 0, cash: 0 });
  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("sales").select("grand_total").eq("organization_id", profile.organization_id).eq("status", "completed"),
      supabase.from("expenses").select("amount").eq("organization_id", profile.organization_id),
      supabase.from("purchases").select("invoice_total").eq("organization_id", profile.organization_id).eq("status", "completed"),
      supabase.from("cash_ledger").select("entry_type,amount").eq("organization_id", profile.organization_id).eq("payment_mode", "cash"),
    ]).then(([sales, expenses, purchases, cash]) => setStats({
      sales: (sales.data || []).reduce((a: number, x: any) => a + Number(x.grand_total || 0), 0),
      expenses: (expenses.data || []).reduce((a: number, x: any) => a + Number(x.amount || 0), 0),
      purchases: (purchases.data || []).reduce((a: number, x: any) => a + Number(x.invoice_total || 0), 0),
      cash: (cash.data || []).reduce((a: number, x: any) => a + (x.entry_type === "receipt" ? Number(x.amount || 0) : -Number(x.amount || 0)), 0),
    }));
  }, [profile.organization_id]);
  return <div><div className="page-head"><div><h1>{view}</h1><p>Native V2 account summary from database records.</p></div></div><section className="summary-strip"><div className="panel summary-card"><span>Sales</span><strong>{money(stats.sales)}</strong><small>Completed bills</small></div><div className="panel summary-card"><span>Purchases</span><strong>{money(stats.purchases)}</strong><small>Completed supplier bills</small></div><div className="panel summary-card"><span>Expenses</span><strong>{money(stats.expenses)}</strong><small>Recorded expenses</small></div><div className="panel summary-card"><span>Cash</span><strong>{money(stats.cash)}</strong><small>Cash ledger balance</small></div></section></div>;
}

export function ExpenseWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [ledgers, setLedgers] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const load = () => {
    if (!supabase) return;
    supabase.from("account_ledgers").select("id,name,active,group:ledger_groups(id,name,group_type)").eq("organization_id", profile.organization_id).eq("active", true).order("name").then(({ data }) => {
      setLedgers((data || []).filter((row: Row) => row.group?.group_type === "expense"));
    });
  };
  useEffect(load, [profile.organization_id]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get("amount") || 0);
    const paymentMode = String(values.get("payment_mode") || "cash");
    const ledgerId = String(values.get("ledger_id") || "");
    const selected = ledgers.find((ledger) => ledger.id === ledgerId);
    if (!selected || amount <= 0) {
      notify("Select expense ledger and enter valid amount");
      return;
    }
    setSaving(true);
    const expenseDate = String(values.get("expense_date"));
    const category = selected.name;
    const description = String(values.get("description") || "");
    try {
      const { data, error } = await supabase.from("expenses").insert({
        organization_id: profile.organization_id,
        expense_date: expenseDate,
        category,
        account_ledger_id: ledgerId,
        amount,
        payment_mode: paymentMode,
        description,
        created_by: profile.id,
      }).select("id").single();
      if (error || !data) throw error || new Error("Expense save failed");
      if (paymentMode === "cash") {
        const { error: cashError } = await supabase.from("cash_ledger").insert({
          organization_id: profile.organization_id,
          occurred_at: `${expenseDate}T00:00:00`,
          entry_type: "payment",
          category,
          reference_type: "expense",
          reference_id: data.id,
          amount,
          payment_mode: "cash",
          created_by: profile.id,
        });
        if (cashError) throw cashError;
      }
      await postJournal(profile, {
        voucherType: "expense",
        entryDate: expenseDate,
        referenceType: "expense",
        referenceId: data.id,
        narration: description || category,
        lines: [{ ledger: category, debit: amount, account_ledger_id: ledgerId }, { ledger: paymentMode === "cash" ? "Cash" : "Bank", credit: amount }],
      });
      notify(`Expense saved${paymentMode === "cash" ? " and reduced from cash ledger" : ""}`);
      form.reset();
    } catch (error: any) {
      notify(error.message || "Expense save failed");
    } finally {
      setSaving(false);
    }
  };
  return <div><div className="page-head"><div><h1>Expense Entry</h1><p>Select an expense ledger created in Ledger Creation.</p></div></div><div className="panel form-panel"><form onSubmit={save}><div className="form-grid"><Field name="expense_date" label="Date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/><label className="field"><span>Expense ledger <b>*</b></span><select name="ledger_id" required><option value="">Select ledger</option>{ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></label><Field name="amount" label="Amount" type="number" required/><label className="field"><span>Payment mode <b>*</b></span><select name="payment_mode" required defaultValue="cash"><option value="cash">Cash</option><option value="bank">Bank</option></select></label><Field name="description" label="Description"/></div><div className="form-actions"><button className="primary" disabled={saving}><CheckCircle2 size={16}/> {saving ? "Saving..." : "Save expense"}</button></div></form>{!ledgers.length && <div className="auth-message">Create an expense ledger first in Ledger Creation.</div>}</div></div>;
}

export function LedgerGroupWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [groups, setGroups] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const load = () => {
    if (!supabase) return;
    supabase.from("ledger_groups").select("id,name,group_type,created_at").eq("organization_id", profile.organization_id).order("name").then(({ data }) => setGroups(data || []));
  };
  useEffect(load, [profile.organization_id]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = { organization_id: profile.organization_id, name: values.get("name"), group_type: values.get("group_type") };
    const { error } = editing ? await supabase.from("ledger_groups").update(payload).eq("id", editing.id) : await supabase.from("ledger_groups").insert(payload);
    notify(error?.message || `Ledger group ${editing ? "updated" : "created"}`);
    if (!error) {
      form.reset();
      setEditing(null);
      load();
    }
  };
  return <div><div className="page-head"><div><h1>Ledger Group</h1><p>Create account groups and use them for ledger reporting.</p></div></div><div className="admin-grid"><div className="panel form-panel"><h2 className="panel-title">{editing ? "Edit group" : "Create group"}</h2><form key={editing?.id || "new-group"} onSubmit={save}><div className="form-grid"><Field name="name" label="Group name" required defaultValue={editing?.name}/><label className="field"><span>Group type <b>*</b></span><select name="group_type" required defaultValue={editing?.group_type || "expense"}><option value="asset">Asset</option><option value="liability">Liability</option><option value="income">Income</option><option value="expense">Expense</option><option value="equity">Equity</option></select></label></div><div className="form-actions">{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel edit</button>}<button className="primary"><CheckCircle2 size={16}/> {editing ? "Update group" : "Create group"}</button></div></form></div><div className="panel"><h2 className="panel-title">Groups</h2><div className="data-wrap"><table className="data-table"><thead><tr><th>Group</th><th>Type</th><th>Created</th><th>Action</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id}><td>{group.name}</td><td>{group.group_type}</td><td>{group.created_at ? new Date(group.created_at).toLocaleDateString("en-IN") : "-"}</td><td><button className="table-edit" onClick={() => setEditing(group)}>Edit</button></td></tr>)}</tbody></table></div></div></div></div>;
}

export function LedgerCreationWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [groups, setGroups] = useState<Row[]>([]);
  const [ledgers, setLedgers] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const load = () => {
    if (!supabase) return;
    Promise.all([
      supabase.from("ledger_groups").select("id,name,group_type").eq("organization_id", profile.organization_id).order("name"),
      supabase.from("account_ledgers").select("id,name,opening_balance,opening_type,active,created_at,group:ledger_groups(id,name,group_type)").eq("organization_id", profile.organization_id).order("name"),
    ]).then(([groupResult, ledgerResult]) => {
      setGroups(groupResult.data || []);
      setLedgers(ledgerResult.data || []);
    });
  };
  useEffect(load, [profile.organization_id]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = {
      organization_id: profile.organization_id,
      ledger_group_id: values.get("ledger_group_id"),
      name: values.get("name"),
      opening_balance: Number(values.get("opening_balance") || 0),
      opening_type: values.get("opening_type") || "debit",
      active: true,
    };
    const { error } = editing ? await supabase.from("account_ledgers").update(payload).eq("id", editing.id) : await supabase.from("account_ledgers").insert(payload);
    notify(error?.message || `Ledger ${editing ? "updated" : "created"}`);
    if (!error) {
      form.reset();
      setEditing(null);
      load();
    }
  };
  return <div><div className="page-head"><div><h1>Ledger Creation</h1><p>Create account ledgers and link them to groups.</p></div></div><div className="admin-grid"><div className="panel form-panel"><h2 className="panel-title">{editing ? "Edit ledger" : "Create ledger"}</h2><form key={editing?.id || "new-ledger"} onSubmit={save}><div className="form-grid"><Field name="name" label="Ledger name" required defaultValue={editing?.name}/><label className="field"><span>Ledger group <b>*</b></span><select name="ledger_group_id" required defaultValue={editing?.group?.id || ""}><option value="">Select group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.group_type})</option>)}</select></label><Field name="opening_balance" label="Opening balance" type="number" defaultValue={editing?.opening_balance}/><label className="field"><span>Opening type</span><select name="opening_type" defaultValue={editing?.opening_type || "debit"}><option value="debit">Debit</option><option value="credit">Credit</option></select></label></div><div className="form-actions">{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel edit</button>}<button className="primary"><CheckCircle2 size={16}/> {editing ? "Update ledger" : "Create ledger"}</button></div></form>{!groups.length && <div className="auth-message">Create ledger groups first in Ledger Group.</div>}</div><div className="panel"><h2 className="panel-title">Ledgers</h2><div className="data-wrap"><table className="data-table"><thead><tr><th>Ledger</th><th>Group</th><th>Type</th><th>Opening</th><th>Active</th><th>Action</th></tr></thead><tbody>{ledgers.map((ledger) => <tr key={ledger.id}><td>{ledger.name}</td><td>{ledger.group?.name || "-"}</td><td>{ledger.group?.group_type || "-"}</td><td>{money(ledger.opening_balance)}</td><td>{ledger.active === false ? "No" : "Yes"}</td><td><button className="table-edit" onClick={() => setEditing(ledger)}>Edit</button></td></tr>)}</tbody></table></div></div></div></div>;
}

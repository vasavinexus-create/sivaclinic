"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bell, Boxes, CheckCircle2, CircleDollarSign, ClipboardPlus, CreditCard, Database,
  FileText, IndianRupee, LayoutDashboard, LogOut, Menu, PackagePlus, Pill, Search, Settings, ShieldCheck,
  ShoppingCart, Stethoscope, TrendingUp, Users, Wallet, X
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { SettingsWorkflow, UsersRolesWorkflow } from "./components/AdminWorkflows";
import { AccountReportWorkflow, ExpenseWorkflow, LedgerCreationWorkflow, LedgerGroupWorkflow } from "./components/AccountReports";
import { DeletedBillsAuditWorkflow } from "./components/AuditWorkflows";
import { ConsultationWorkflow, FollowUpWorkflow, PatientHistoryWorkflow } from "./components/ClinicalWorkflows";
import PagedCrud from "./components/PagedCrud";
import { InpatientPaymentWorkflow, SupplierPaymentWorkflow } from "./components/PaymentWorkflows";
import { BillingWorkflow, InpatientBillingWorkflow } from "./components/PharmacyWorkflows";
import { PurchaseHistoryWorkflow, PurchaseWorkflow } from "./components/PurchaseWorkflows";
import { PurchaseImportWorkflow } from "./components/PurchaseImportWorkflow";
import { MappingManagementWorkflow } from "./components/MappingManagementWorkflow";
import { MedicineSalesWorkflow } from "./components/InventoryReports";
import { RateEditVerificationWorkflow } from "./components/VerificationWorkflows";
import { SalesWorkflow } from "./components/SalesWorkflows";
import WorkflowShell from "./components/WorkflowShell";
import { getV2Module, v2Nav } from "./lib/modules";
import { v2WorkflowPages } from "./lib/workflowPages";
import { Organization, Profile } from "./lib/types";
import { money } from "./lib/format";

function Loading() {
  return <div className="loading-page">Loading scalable version...</div>;
}

function SignInNotice() {
  return <div className="auth-page"><div className="auth-card"><h1>MediFlow V2</h1><p className="auth-message">Please sign in from the current app first, then open this version.</p><a className="primary auth-submit" href="/">Open current app</a></div></div>;
}

const icons: Record<string, any> = {
  dashboard: LayoutDashboard,
  patients: Users,
  consultation: Stethoscope,
  "patient-history": FileText,
  "doctor-fees-pending": Wallet,
  "follow-up-alerts": Bell,
  doctors: Activity,
  billing: ShoppingCart,
  sales: CircleDollarSign,
  "medicine-sales": Pill,
  medicine: Pill,
  inventory: Boxes,
  "low-stock": AlertTriangle,
  "rate-edit-verification": ShieldCheck,
  "inpatient-billing": ShoppingCart,
  "inpatient-payment": CreditCard,
  "inpatient-ledger": FileText,
  "expiry-alerts": AlertTriangle,
  "purchase-import": FileText,
  "product-mappings": ShieldCheck,
  "new-purchase": PackagePlus,
  "purchase-history": FileText,
  suppliers: ClipboardPlus,
  "supplier-payments": CreditCard,
  "supplier-ledger": Wallet,
  "deleted-bills-audit": ShieldCheck,
  "day-book": FileText,
  "cash-ledger": Wallet,
  "sales-account": CircleDollarSign,
  "expense-entry": CreditCard,
  "ledger-creation": ClipboardPlus,
  "ledger-statement": FileText,
  "ledger-group": Boxes,
  "current-balance": Wallet,
  "balance-sheet": TrendingUp,
  "profit-loss": IndianRupee,
  reports: TrendingUp,
  "users-roles": ShieldCheck,
  settings: Settings,
};

const accountReportPages = new Set(["day-book", "cash-ledger", "sales-account", "ledger-statement", "current-balance", "balance-sheet", "profit-loss", "reports"]);

function V2Dashboard({ profile }: { profile: Profile }) {
  const [stats, setStats] = useState({ patients: 0, medicines: 0, sales: 0, purchases: 0, stock: 0, expenses: 0 });
  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
      supabase.from("sales").select("grand_total").eq("organization_id", profile.organization_id).eq("status", "completed"),
      supabase.from("purchases").select("invoice_total").eq("organization_id", profile.organization_id),
      supabase.from("medicine_batches").select("current_stock").eq("organization_id", profile.organization_id).gt("current_stock", 0),
      supabase.from("expenses").select("amount").eq("organization_id", profile.organization_id),
    ]).then(([patients, medicines, sales, purchases, stock, expenses]) => {
      setStats({
        patients: patients.count || 0,
        medicines: medicines.count || 0,
        sales: (sales.data || []).reduce((sum, row: any) => sum + Number(row.grand_total || 0), 0),
        purchases: (purchases.data || []).reduce((sum, row: any) => sum + Number(row.invoice_total || 0), 0),
        stock: (stock.data || []).reduce((sum, row: any) => sum + Number(row.current_stock || 0), 0),
        expenses: (expenses.data || []).reduce((sum, row: any) => sum + Number(row.amount || 0), 0),
      });
    });
  }, [profile.organization_id]);
  return <div>
    <div className="page-head"><div><h1>Dashboard</h1><p>Native V2 summary from database-side queries.</p></div></div>
    <section className="metrics">
      <div className="metric"><div className="metric-icon green"><Users size={20}/></div><div className="metric-copy"><span>Patients</span><strong>{stats.patients}</strong></div></div>
      <div className="metric"><div className="metric-icon green"><Pill size={20}/></div><div className="metric-copy"><span>Medicines</span><strong>{stats.medicines}</strong></div></div>
      <div className="metric"><div className="metric-icon green"><CircleDollarSign size={20}/></div><div className="metric-copy"><span>Sales</span><strong>{money(stats.sales)}</strong></div></div>
      <div className="metric"><div className="metric-icon green"><PackagePlus size={20}/></div><div className="metric-copy"><span>Purchases</span><strong>{money(stats.purchases)}</strong></div></div>
      <div className="metric"><div className="metric-icon green"><Boxes size={20}/></div><div className="metric-copy"><span>Stock units</span><strong>{stats.stock}</strong></div></div>
      <div className="metric"><div className="metric-icon green"><CreditCard size={20}/></div><div className="metric-copy"><span>Expenses</span><strong>{money(stats.expenses)}</strong></div></div>
    </section>
  </div>;
}

function NativeV2Page({ label }: { label: string }) {
  return <div>
    <div className="page-head"><div><h1>{label}</h1><p>Native V2 workspace.</p></div></div>
    <div className="panel v2-pending"><Database size={34}/><h2>{label}</h2><p>This page is part of the new V2 app and no longer opens the old single-page app. Database-heavy pages are being handled through native V2 server-side search, filters, and pagination. Use the matching V2 registers in the sidebar for fast large-data work.</p></div>
  </div>;
}

export default function V2App() {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [active, setActive] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const module = useMemo(() => getV2Module(active), [active]);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setProfile(null);
      return;
    }
    supabase.from("profiles").select("id,organization_id,full_name,role,active").eq("id", session.user.id).single().then(({ data }) => setProfile(data as Profile || null));
  }, [session]);

  useEffect(() => {
    if (!profile || !supabase) {
      setOrganization(null);
      return;
    }
    supabase.from("organizations").select("id,clinic_name,pharmacy_name").eq("id", profile.organization_id).single().then(({ data }) => setOrganization(data as Organization || null));
  }, [profile]);

  if (session === undefined) return <Loading/>;
  if (!session) return <SignInNotice/>;
  if (!profile) return <Loading/>;

  const brandName = organization?.clinic_name || "MEDIFLOW";
  const brandSub = organization?.pharmacy_name || "Scalable V2";
  const pageLabel = v2Nav.find((item) => item.key === active)?.label || active;
  const body = active === "dashboard"
    ? <V2Dashboard profile={profile}/>
    : active === "consultation"
      ? <ConsultationWorkflow profile={profile} notify={setNotice}/>
      : active === "patient-history"
        ? <PatientHistoryWorkflow profile={profile} notify={setNotice}/>
        : active === "follow-up-alerts"
          ? <FollowUpWorkflow/>
          : active === "billing"
            ? <BillingWorkflow profile={profile} notify={setNotice}/>
            : active === "new-purchase"
              ? <PurchaseWorkflow profile={profile} notify={setNotice}/>
              : active === "inpatient-billing"
                ? <InpatientBillingWorkflow profile={profile} notify={setNotice}/>
                : active === "sales"
                  ? <SalesWorkflow profile={profile} notify={setNotice}/>
                  : active === "purchase-import"
                    ? <PurchaseImportWorkflow profile={profile} notify={setNotice}/>
                    : active === "product-mappings"
                      ? <MappingManagementWorkflow profile={profile} notify={setNotice}/>
                      : active === "medicine-sales"
                    ? <MedicineSalesWorkflow profile={profile}/>
                    : active === "supplier-payments"
                      ? <SupplierPaymentWorkflow profile={profile} notify={setNotice}/>
                      : active === "purchase-history"
                        ? <PurchaseHistoryWorkflow profile={profile} notify={setNotice}/>
                        : active === "inpatient-payment"
                          ? <InpatientPaymentWorkflow profile={profile} notify={setNotice}/>
                          : active === "settings"
                            ? <SettingsWorkflow profile={profile} notify={setNotice}/>
                            : active === "users-roles"
                              ? <UsersRolesWorkflow notify={setNotice}/>
                              : active === "rate-edit-verification"
                                ? <RateEditVerificationWorkflow profile={profile} notify={setNotice}/>
                                : active === "deleted-bills-audit"
                                  ? <DeletedBillsAuditWorkflow profile={profile} notify={setNotice}/>
                                  : active === "expense-entry"
                                    ? <ExpenseWorkflow profile={profile} notify={setNotice}/>
                                    : active === "ledger-creation"
                                      ? <LedgerCreationWorkflow profile={profile} notify={setNotice}/>
                                      : active === "ledger-group"
                                        ? <LedgerGroupWorkflow profile={profile} notify={setNotice}/>
                                        : accountReportPages.has(active)
                                          ? <AccountReportWorkflow view={pageLabel} profile={profile}/>
                                          : module
                                            ? <PagedCrud module={module} profile={profile} notify={setNotice}/>
                                            : v2WorkflowPages.has(active)
                                              ? <WorkflowShell pageKey={active} label={pageLabel}/>
                                              : <NativeV2Page label={pageLabel}/>;

  return <main className="app-shell v2-shell">
    <aside className={`sidebar ${sideOpen ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><img src="/mediflow-logo.jpg" alt="MEDIFLOW"/></div><div><strong>{brandName}</strong><small>{brandSub}</small></div><button className="mobile-close" title="Close menu" onClick={() => setSideOpen(false)}><X size={20}/></button></div>
      <nav>{v2Nav.map((item, index) => {
        if (item.title) return <p className="nav-title" key={`${item.title}-${index}`}>{item.title}</p>;
        const Icon = icons[item.key || ""] || Database;
        return <button key={item.key} className={`nav-item ${active === item.key ? "active" : ""}`} onClick={() => { setActive(item.key || "dashboard"); setSideOpen(false); }}><Icon size={18}/><span>{item.label}</span></button>;
      })}<p className="nav-title">CURRENT APP</p><a className="nav-item" href="/">Open existing app</a></nav>
      <div className="sidebar-user"><div className="avatar">{profile.full_name.slice(0, 2).toUpperCase()}</div><div><strong>{profile.full_name}</strong><span>{profile.role.replace("_", " ")}</span></div><button className="logout-mini" title="Sign out" onClick={() => supabase?.auth.signOut()}><LogOut size={16}/></button></div>
    </aside>
    <section className="workspace"><header className="topbar"><button className="menu-btn" onClick={() => setSideOpen(true)}><Menu size={22}/></button><div className="global-search"><Search size={18}/><input readOnly value="Database-side search, filter and pagination"/><kbd>V2</kbd></div><div className="top-actions"><button className="icon-btn"><Bell size={19}/></button><div className="org"><span>{brandName}</span><small>Scalable version</small></div><div className="avatar small">{profile.full_name.slice(0, 2).toUpperCase()}</div></div></header><div className="content">{body}</div></section>
    {sideOpen && <div className="overlay" onClick={() => setSideOpen(false)}/>}
    {notice && <div className="toast"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice("")}><X size={15}/></button></div>}
  </main>;
}

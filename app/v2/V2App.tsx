"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Users, CircleDollarSign, PackagePlus, Boxes, CreditCard } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { rolePages } from "../../lib/page-permissions";
import { SettingsWorkflow } from "./components/AdminWorkflows";
import { ExpenseWorkflow, LedgerCreationWorkflow, LedgerGroupWorkflow } from "./components/AccountReports";
import { DeletedBillsAuditWorkflow } from "./components/AuditWorkflows";
import { ConsultationWorkflow, FollowUpWorkflow, PatientHistoryWorkflow } from "./components/ClinicalWorkflows";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PagedCrud from "./components/PagedCrud";
import { InpatientPaymentWorkflow, SupplierPaymentWorkflow } from "./components/PaymentWorkflows";
import { BillingWorkflow, InpatientBillingWorkflow } from "./components/PharmacyWorkflows";
import { PurchaseHistoryWorkflow, PurchaseWorkflow } from "./components/PurchaseWorkflows";
import { PurchaseImportWorkflow } from "./components/PurchaseImportWorkflow";
import { AdvancedPurchaseImportWorkflow } from "./components/AdvancedPurchaseImportWorkflow";
import { MappingManagementWorkflow } from "./components/MappingManagementWorkflow";
import { MedicineSalesWorkflow } from "./components/InventoryReports";
import { RateEditVerificationWorkflow } from "./components/VerificationWorkflows";
import { SalesWorkflow } from "./components/SalesWorkflows";
import { DoctorFeesPendingWorkflow } from "./components/DoctorFeesPendingWorkflow";
import { InpatientLedgerWorkflow } from "./components/InpatientLedgerWorkflow";
import { SupplierLedgerWorkflow } from "./components/SupplierLedgerWorkflow";
import WorkflowShell from "./components/WorkflowShell";
import V2Sidebar from "./components/V2Sidebar";
import V2Topbar from "./components/V2Topbar";
import UsersPage from "../components/UsersPage";
import FinancialReports from "../components/FinancialReports";
import { getV2Module, v2Nav } from "./lib/modules";
import { Organization, Profile } from "./lib/types";
import { money } from "./lib/format";
import { X, CheckCircle2 as CheckIcon } from "lucide-react";

// ─── Loading / Auth screens ────────────────────────────────────────────────
function Loading() {
  return <div className="loading-page">Loading scalable version...</div>;
}

function SignInNotice() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>MediFlow V2</h1>
        <p className="auth-message">Please sign in from the current app first, then open this version.</p>
        <a className="primary auth-submit" href="/">Open current app</a>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────
function V2Dashboard({ profile }: { profile: Profile }) {
  const [stats, setStats] = useState({ patients: 0, medicines: 0, sales: 0, purchases: 0, stock: 0, expenses: 0 });
  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
      supabase.from("sales").select("grand_total").eq("organization_id", profile.organization_id).eq("status", "completed"),
      supabase.from("purchases").select("invoice_total").eq("organization_id", profile.organization_id).neq("status", "cancelled"),
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
  return (
    <div>
      <div className="page-head"><div><h1>Dashboard</h1><p>Native V2 summary from database-side queries.</p></div></div>
      <section className="metrics">
        <div className="metric"><div className="metric-icon green"><Users size={20} /></div><div className="metric-copy"><span>Patients</span><strong>{stats.patients}</strong></div></div>
        <div className="metric"><div className="metric-icon green"><Database size={20} /></div><div className="metric-copy"><span>Medicines</span><strong>{stats.medicines}</strong></div></div>
        <div className="metric"><div className="metric-icon green"><CircleDollarSign size={20} /></div><div className="metric-copy"><span>Sales</span><strong>{money(stats.sales)}</strong></div></div>
        <div className="metric"><div className="metric-icon green"><PackagePlus size={20} /></div><div className="metric-copy"><span>Purchases</span><strong>{money(stats.purchases)}</strong></div></div>
        <div className="metric"><div className="metric-icon green"><Boxes size={20} /></div><div className="metric-copy"><span>Stock units</span><strong>{stats.stock}</strong></div></div>
        <div className="metric"><div className="metric-icon green"><CreditCard size={20} /></div><div className="metric-copy"><span>Expenses</span><strong>{money(stats.expenses)}</strong></div></div>
      </section>
    </div>
  );
}

// ─── Fallback for unimplemented pages ────────────────────────────────────
function NativeV2Page({ label }: { label: string }) {
  return (
    <div>
      <div className="page-head"><div><h1>{label}</h1><p>Native V2 workspace.</p></div></div>
      <div className="panel v2-pending">
        <Database size={34} />
        <h2>{label}</h2>
        <p>This page is part of the new V2 app and no longer opens the old single-page app.</p>
      </div>
    </div>
  );
}

// ─── Page props type ──────────────────────────────────────────────────────
type PageProps = {
  profile: Profile;
  organization: Organization | null;
  notify: (s: string) => void;
  onOrganizationChange?: (org: Organization | null) => void;
};

// ─── PAGE REGISTRY — industry-standard route map (replaces nested ternary) ──
const PAGE_REGISTRY: Record<string, any> = {
  
  "consultation":           ConsultationWorkflow,
  "patient-history":        PatientHistoryWorkflow,
  "follow-up-alerts":       FollowUpWorkflow,
  "billing":                BillingWorkflow,
  "new-purchase":           PurchaseWorkflow,
  "inpatient-billing":      InpatientBillingWorkflow,
  "inpatient-ledger":       InpatientLedgerWorkflow,
  "sales":                  SalesWorkflow,
  "purchase-import":        PurchaseImportWorkflow,
  "adv-purchase-import":    AdvancedPurchaseImportWorkflow,
  "product-mappings":       MappingManagementWorkflow,
  "medicine-sales":         MedicineSalesWorkflow,
  "supplier-payments":      SupplierPaymentWorkflow,
  "purchase-history":       PurchaseHistoryWorkflow,
  "inpatient-payment":      InpatientPaymentWorkflow,
  "doctor-fees-pending":    DoctorFeesPendingWorkflow,
  
  "supplier-ledger":        SupplierLedgerWorkflow,
  "settings":               SettingsWorkflow,
  "users-and-roles":        UsersPage,
  "rate-edit-verification": RateEditVerificationWorkflow,
  "deleted-bills-audit":    DeletedBillsAuditWorkflow,
  "expense-entry":          ExpenseWorkflow,
  "ledger-creation":        LedgerCreationWorkflow,
  "ledger-group":           LedgerGroupWorkflow,
};

const accountReportPages = new Set([
  "day-book", "cash-book", "bank-book", "sales-report", "purchase-report", "expense-report", "ledger-report", "trial-balance",
  "current-balance", "balance-sheet", "profit-loss", "receivables-report", "payables-report", "gst-report", "outstanding-report", "reports", "cash-ledger", "sales-account", "ledger-statement"
]);

// ─── Main App ─────────────────────────────────────────────────────────────
import { useRealtimeSync } from "./lib/useRealtimeSync";

export default function V2App({ pageKey = "dashboard" }: { pageKey?: string }) {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [allowedPages, setAllowedPages] = useState<string[] | null>(null);
  const [accessError, setAccessError] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const active = pageKey;
  const module = useMemo(() => getV2Module(active), [active]);

  // Activate global realtime cache invalidation
  useRealtimeSync(profile?.organization_id);

  // Auth
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  // Profile
  useEffect(() => {
    if (!session || !supabase) { setProfile(null); return; }
    supabase.from("profiles").select("id,organization_id,full_name,role,active")
      .eq("id", session.user.id).single()
      .then(({ data }) => setProfile(data as Profile || null));
  }, [session]);

  // Organization
  useEffect(() => {
    if (!profile || !supabase) { setOrganization(null); return; }
    supabase.from("organizations").select("id,clinic_name,pharmacy_name,sales_gst_mode,sales_discount_percent")
      .eq("id", profile.organization_id).single()
      .then(({ data }) => setOrganization(data as Organization || null));
  }, [profile]);

  // Page permissions
  useEffect(() => {
    let alive = true;
    setAllowedPages(null);
    setAccessError("");
    if (!profile || !supabase) return;
    if (!profile.active) { setAccessError("This login is inactive."); return; }
    if (["admin", "software_owner"].includes(profile.role)) {
      setAllowedPages(v2Nav.flatMap(item => item.label ? [item.label] : []));
      return;
    }
    supabase.from("page_permissions").select("page_key").eq("profile_id", profile.id)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setAccessError(error.message); return; }
        setAllowedPages(data?.length ? data.map(row => row.page_key) : rolePages[profile.role] || []);
      });
    return () => { alive = false; };
  }, [profile]);

  // Auth gates
  if (session === undefined) return <Loading />;
  if (!session) return <SignInNotice />;
  if (!profile) return <Loading />;
  if (accessError) return <div role="alert" className="error-box">{accessError}</div>;
  if (!allowedPages) return <Loading />;

  const brandName = organization?.clinic_name || "MEDIFLOW";
  const brandSub = organization?.pharmacy_name || "Scalable V2";
  const pageLabel = v2Nav.find(item => item.key === active)?.label || active;
  const pageProps: PageProps = { profile, organization, notify: setNotice, onOrganizationChange: setOrganization };

  // ─── Resolve page body via registry ─────────────────────────────────
  let body: React.ReactNode;

  if (!allowedPages.includes(pageLabel)) {
    body = <div role="alert" className="error-box">You do not have access to this page.</div>;
  } else if (active === "dashboard") {
    body = <ErrorBoundary key={active}><V2Dashboard profile={profile} /></ErrorBoundary>;
  } else if (PAGE_REGISTRY[active]) {
    const Component = PAGE_REGISTRY[active];
    body = <ErrorBoundary key={active}><Component {...pageProps} /></ErrorBoundary>;
  } else if (accountReportPages.has(active)) {
    body = <ErrorBoundary key={active}><FinancialReports view={pageLabel} organizationId={profile.organization_id} /></ErrorBoundary>;
  } else if (module) {
    body = <ErrorBoundary key={active}><PagedCrud module={module} profile={profile} notify={setNotice} /></ErrorBoundary>;
  } else {
    body = <WorkflowShell pageKey={active} label={pageLabel} />;
  }

  return (
    <main className="app-shell v2-shell">
      <V2Sidebar
        active={active}
        allowedPages={allowedPages}
        profile={profile}
        brandName={brandName}
        brandSub={brandSub}
        sideOpen={sideOpen}
        onClose={() => setSideOpen(false)}
      />
      <section className="workspace">
        <V2Topbar brandName={brandName} profile={profile} onMenuOpen={() => setSideOpen(true)} />
        <div className="content">{body}</div>
      </section>
      {sideOpen && <div className="overlay" onClick={() => setSideOpen(false)} />}
      {notice && (
        <div className="toast">
          <CheckIcon size={17} />{notice}
          <button onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      )}
    </main>
  );
}

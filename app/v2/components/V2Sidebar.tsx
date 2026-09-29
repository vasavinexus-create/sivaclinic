"use client";

import React from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, Bell, Boxes, CircleDollarSign, ClipboardPlus,
  CreditCard, Database, FileText, IndianRupee, LayoutDashboard, LogOut,
  Menu, PackagePlus, Pill, Settings, ShieldCheck, ShoppingCart,
  Stethoscope, TrendingUp, Users, Wallet, X
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Profile } from "../lib/types";
import { v2Nav } from "../lib/modules";

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
  "adv-purchase-import": FileText,
  "product-mappings": ShieldCheck,
  "new-purchase": PackagePlus,
  "purchase-history": FileText,
  suppliers: ClipboardPlus,
  "supplier-payments": CreditCard,
  "supplier-ledger": Wallet,
  "deleted-bills-audit": ShieldCheck,
  
  "expense-entry": CreditCard,
  "ledger-creation": ClipboardPlus,
  "ledger-group": Boxes,
  
  "day-book": FileText,
  "cash-book": Wallet,
  "bank-book": Wallet,
  "ledger-report": FileText,
  "trial-balance": TrendingUp,
  "profit-loss": IndianRupee,
  "balance-sheet": TrendingUp,
  "current-balance": Wallet,
  "receivables-report": CircleDollarSign,
  "payables-report": CreditCard,
  "outstanding-report": AlertTriangle,
  "expense-report": CreditCard,
  "purchase-report": ShoppingCart,
  "sales-report": CircleDollarSign,
  "gst-report": FileText,
  
  "users-and-roles": ShieldCheck,
  settings: Settings,
};

interface V2SidebarProps {
  active: string;
  allowedPages: string[];
  profile: Profile;
  brandName: string;
  brandSub: string;
  sideOpen: boolean;
  onClose: () => void;
}

const V2Sidebar = React.memo(function V2Sidebar({
  active, allowedPages, profile, brandName, brandSub, sideOpen, onClose
}: V2SidebarProps) {
  return (
    <aside className={`sidebar ${sideOpen ? "open" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><img src="/mediflow-logo.jpg" alt="MEDIFLOW" /></div>
        <div><strong>{brandName}</strong><small>{brandSub}</small></div>
        <button className="mobile-close" title="Close menu" onClick={onClose}><X size={20} /></button>
      </div>
      <nav>
        {v2Nav.map((item, index) => {
          if (item.title) return <p className="nav-title" key={`${item.title}-${index}`}>{item.title}</p>;
          if (!allowedPages.includes(item.label || "")) return null;
          const Icon = icons[item.key || ""] || Database;
          return (
            <Link
              key={item.key}
              href={item.key === "dashboard" ? "/v2" : `/v2/${item.key}`}
              className={`nav-item ${active === item.key ? "active" : ""}`}
              aria-current={active === item.key ? "page" : undefined}
              onClick={onClose}
            >
              <Icon size={18} /><span>{item.label}</span>
            </Link>
          );
        })}
        
      </nav>
      <div className="sidebar-user">
        <div className="avatar">{profile.full_name.slice(0, 2).toUpperCase()}</div>
        <div><strong>{profile.full_name}</strong><span>{profile.role.replace("_", " ")}</span></div>
        <button className="logout-mini" title="Sign out" onClick={() => supabase?.auth.signOut()}><LogOut size={16} /></button>
      </div>
    </aside>
  );
});

export default V2Sidebar;

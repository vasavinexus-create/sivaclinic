# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/V2Sidebar.tsx', 'r', 'utf-8') as f:
    code = f.read()

new_icons = """const icons: Record<string, any> = {
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
};"""

start_idx = code.find('const icons: Record<string, any> = {')
end_idx = code.find('};', start_idx) + 2

if start_idx != -1 and end_idx != -1:
    code = code[:start_idx] + new_icons + code[end_idx:]
    with codecs.open('app/v2/components/V2Sidebar.tsx', 'w', 'utf-8') as f:
        f.write(code)
    print("Replaced V2Sidebar icons")
else:
    print("Could not find bounds")

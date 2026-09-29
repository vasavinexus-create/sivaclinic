# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/lib/modules.ts', 'r', 'utf-8') as f:
    code = f.read()

new_nav = """export const v2Nav: V2NavItem[] = [
  { label: "Dashboard", key: "dashboard" },
  { title: "CLINIC" },
  { label: "Patients", key: "patients" },
  { label: "Consultation", key: "consultation" },
  { label: "Patient History", key: "patient-history" },
  { label: "Doctor Fees Pending", key: "doctor-fees-pending" },
  { label: "Follow-up Alerts", key: "follow-up-alerts" },
  { label: "Doctors", key: "doctors" },
  { title: "PHARMACY" },
  { label: "Billing", key: "billing" },
  { label: "Sales", key: "sales" },
  { label: "Medicine Sales", key: "medicine-sales" },
  { label: "Medicine", key: "medicine" },
  { label: "Inventory", key: "inventory" },
  { label: "Low Stock", key: "low-stock" },
  { label: "Rate Edit Verification", key: "rate-edit-verification" },
  { title: "INPATIENT" },
  { label: "Inpatient Billing", key: "inpatient-billing" },
  { label: "Inpatient Payment", key: "inpatient-payment" },
  { label: "Inpatient Ledger", key: "inpatient-ledger" },
  { label: "Expiry Alerts", key: "expiry-alerts" },
  { title: "PURCHASES" },
  { label: "AI Bill Import", key: "purchase-import" },
  { label: "Adv AI Bill Import", key: "adv-purchase-import" },
  { label: "Product Mappings", key: "product-mappings" },
  { label: "New Purchase", key: "new-purchase" },
  { label: "Purchase History", key: "purchase-history" },
  { label: "Suppliers", key: "suppliers" },
  { label: "Supplier Payments", key: "supplier-payments" },
  { label: "Supplier Ledger", key: "supplier-ledger" },
  { label: "Deleted Bills Audit", key: "deleted-bills-audit" },
  { title: "ACCOUNTS" },
  { label: "Expense Entry", key: "expense-entry" },
  { label: "Ledger Creation", key: "ledger-creation" },
  { label: "Ledger Group", key: "ledger-group" },
  { title: "REPORTS & STATEMENTS" },
  { label: "Day Book", key: "day-book" },
  { label: "Daily Cash Book", key: "cash-book" },
  { label: "Bank Book", key: "bank-book" },
  { label: "Ledger Report", key: "ledger-report" },
  { label: "Trial Balance", key: "trial-balance" },
  { label: "Profit & Loss", key: "profit-loss" },
  { label: "Balance Sheet", key: "balance-sheet" },
  { label: "Current Balance", key: "current-balance" },
  { label: "Receivables Report", key: "receivables-report" },
  { label: "Payables Report", key: "payables-report" },
  { label: "Outstanding Report", key: "outstanding-report" },
  { label: "Expense Report", key: "expense-report" },
  { label: "Purchase Report", key: "purchase-report" },
  { label: "Sales/Billing Report", key: "sales-report" },
  { label: "GST/Tax Report", key: "gst-report" },
  { title: "ADMINISTRATION" },
  { label: "Users & Roles", key: "users-and-roles" },
  { label: "Settings", key: "settings" },
];"""

# Replace the block
start_idx = code.find('export const v2Nav: V2NavItem[] = [')
end_idx = code.find('];', start_idx) + 2

if start_idx != -1 and end_idx != -1:
    code = code[:start_idx] + new_nav + code[end_idx:]
    with codecs.open('app/v2/lib/modules.ts', 'w', 'utf-8') as f:
        f.write(code)
    print("Replaced v2Nav")
else:
    print("Could not find v2Nav bounds")

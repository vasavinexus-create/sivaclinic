export interface PageSection {
  title: string;
  pages: string[];
}

export const clinicPageSections: PageSection[] = [
  {
    title: "General",
    pages: ["Dashboard"],
  },
  {
    title: "Clinic & Clinical",
    pages: [
      "Patients",
      "Pre-Examination",
      "Consultation",
      "Patient History",
      "Doctor Fees Pending",
      "Follow-up Alerts",
      "Doctors",
    ],
  },
  {
    title: "Pharmacy & Medicines",
    pages: [
      "Billing",
      "Sales",
      "Medicine Sales",
      "Medicine",
      "Inventory",
      "Stock Reset",
      "Low Stock",
      "Expiry Alerts",
      "Rate Edit Verification",
    ],
  },
  {
    title: "Inpatient Care",
    pages: [
      "Inpatient Billing",
      "Inpatient Payment",
      "Inpatient Ledger",
    ],
  },
  {
    title: "Purchases & Suppliers",
    pages: [
      "AI Bill Import",
      "Adv AI Bill Import",
      "Product Mappings",
      "New Purchase",
      "Purchase History",
      "Suppliers",
      "Supplier Payments",
      "Supplier Ledger",
      "Deleted Bills Audit",
    ],
  },
  {
    title: "Accounting & Ledgers",
    pages: [
      "Expense Entry",
      "Ledger Creation",
      "Ledger Group",
    ],
  },
  {
    title: "Financial Reports & Statements",
    pages: [
      "Day Book",
      "Daily Cash Book",
      "Bank Book",
      "Ledger Report",
      "Trial Balance",
      "Profit & Loss",
      "Balance Sheet",
      "Current Balance",
      "Receivables Report",
      "Payables Report",
      "Outstanding Report",
      "Expense Report",
      "Purchase Report",
      "Sales/Billing Report",
      "GST/Tax Report",
      "Cash Ledger",
      "Sales Account",
      "Ledger Statement",
      "Reports",
    ],
  },
  {
    title: "Administration",
    pages: [
      "Users & Roles",
      "Settings",
    ],
  },
];

export const allPageLabels: string[] = Array.from(
  new Set(clinicPageSections.flatMap((s) => s.pages))
);

export const rolePages: Record<string, string[]> = {
  admin: allPageLabels,
  software_owner: ["Clinic Management"],
  doctor: [
    "Dashboard",
    "Patients",
    "Pre-Examination",
    "Consultation",
    "Patient History",
    "Doctor Fees Pending",
    "Follow-up Alerts",
  ],
  pharmacist: [
    "Dashboard",
    "Billing",
    "Sales",
    "Medicine Sales",
    "Medicine",
    "Inventory",
    "Stock Reset",
    "Low Stock",
    "Expiry Alerts",
    "Inpatient Billing",
  ],
  receptionist: [
    "Dashboard",
    "Patients",
    "Pre-Examination",
    "Patient History",
    "Doctor Fees Pending",
    "Follow-up Alerts",
    "Billing",
    "Inpatient Payment",
    "Inpatient Ledger",
  ],
  accountant: [
    "Dashboard",
    "Sales",
    "Medicine Sales",
    "Purchase History",
    "Supplier Payments",
    "Supplier Ledger",
    "Deleted Bills Audit",
    "Rate Edit Verification",
    "Inpatient Payment",
    "Inpatient Ledger",
    "Expense Entry",
    "Ledger Creation",
    "Ledger Group",
    "Day Book",
    "Daily Cash Book",
    "Bank Book",
    "Ledger Report",
    "Trial Balance",
    "Profit & Loss",
    "Balance Sheet",
    "Current Balance",
    "Receivables Report",
    "Payables Report",
    "Outstanding Report",
    "Expense Report",
    "Purchase Report",
    "Sales/Billing Report",
    "GST/Tax Report",
    "Cash Ledger",
    "Sales Account",
    "Ledger Statement",
    "Reports",
  ],
  store_manager: [
    "Medicine",
    "Inventory",
    "Stock Reset",
    "Low Stock",
    "Expiry Alerts",
    "AI Bill Import",
    "Adv AI Bill Import",
    "Product Mappings",
    "New Purchase",
    "Purchase History",
    "Suppliers",
    "Supplier Ledger",
    "Deleted Bills Audit",
  ],
};

export const roleOptions = [
  "admin",
  "doctor",
  "receptionist",
  "pharmacist",
  "accountant",
  "store_manager",
];




export const allPageLabels = ["Dashboard","Clinic Management","Patients","Consultation","Patient History","Doctor Fees Pending","Follow-up Alerts","Doctors","Billing","Sales","Medicine Sales","Medicine","Inventory","Stock Reset","Low Stock","Rate Edit Verification","Inpatient Billing","Inpatient Payment","Inpatient Ledger","Expiry Alerts","AI Bill Import","Adv AI Bill Import","New Purchase","Purchase History","Suppliers","Supplier Payments","Supplier Ledger","Deleted Bills Audit","Day Book","Cash Ledger","Sales Account","Expense Entry","Ledger Creation","Ledger Statement","Ledger Group","Current Balance","Balance Sheet","Profit & Loss","Reports","Users & Roles","Settings","Product Mappings"];
export const rolePages:Record<string,string[]> = {
  admin: allPageLabels,
  software_owner: allPageLabels,
  doctor: ["Dashboard","Clinic Management","Patients","Consultation","Patient History","Doctor Fees Pending","Follow-up Alerts"],
  pharmacist: ["Dashboard","Clinic Management","Billing","Sales","Medicine Sales","Medicine","Inventory","Stock Reset","Low Stock","Expiry Alerts","Inpatient Billing"],
  receptionist: ["Dashboard","Clinic Management","Patients","Patient History","Doctor Fees Pending","Follow-up Alerts","Billing","Inpatient Payment","Inpatient Ledger"],
  accountant: ["Dashboard","Clinic Management","Sales","Medicine Sales","Purchase History","Supplier Payments","Supplier Ledger","Deleted Bills Audit","Rate Edit Verification","Inpatient Payment","Inpatient Ledger","Day Book","Cash Ledger","Sales Account","Expense Entry","Ledger Creation","Ledger Statement","Ledger Group","Current Balance","Balance Sheet","Profit & Loss","Reports"],
  store_manager: ["Medicine","Inventory","Stock Reset","Low Stock","Expiry Alerts","AI Bill Import","Adv AI Bill Import","New Purchase","Purchase History","Suppliers","Supplier Ledger","Deleted Bills Audit"],
};
export const roleOptions = ["admin","doctor","receptionist","pharmacist","accountant","store_manager"];


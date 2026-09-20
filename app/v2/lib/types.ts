export type Row = Record<string, any>;

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  role: string;
  active: boolean;
};

export type Organization = {
  id: string;
  clinic_name: string | null;
  pharmacy_name: string | null;
};

export type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "date" | "select";
  required?: boolean;
  options?: string[];
  defaultValue?: string | number;
  readonlyOnCreate?: boolean;
};

export type ListFilter = {
  key: string;
  label: string;
  type: "select";
  options: Array<{ label: string; value: string }>;
};

export type ModuleConfig = {
  key: string;
  navLabel: string;
  title: string;
  subtitle: string;
  table: string;
  select: string;
  idPrefix?: string;
  orderBy: string;
  ascending?: boolean;
  searchColumns: string[];
  columns: Array<[string, string]>;
  fields: FieldConfig[];
  filters?: ListFilter[];
  editable?: boolean;
  organizationColumn?: string | null;
};

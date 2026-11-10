import { supabase } from "../../../lib/supabase";

export const DEFAULT_MEDICINE_CATEGORIES = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Injection",
  "Ointment",
  "Cream",
  "Drops",
  "Inhaler",
  "Gel",
  "Lotion",
  "Powder",
  "Sachet",
  "Device",
  "Surgical",
  "Ayurvedic",
  "General",
];

export function formatCategoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  // Capitalize first letter of each word if all lower/mixed, or preserve if already formatted
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getLocalStoredCategories(organizationId?: string | null): string[] {
  if (typeof window === "undefined" || !organizationId) return [];
  try {
    const raw = window.localStorage.getItem(`mediflow_medicine_categories_${organizationId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    }
  } catch {}
  return [];
}

export function setLocalStoredCategory(organizationId: string | undefined | null, category: string): void {
  if (typeof window === "undefined" || !organizationId || !category) return;
  try {
    const formatted = formatCategoryName(category);
    const existing = getLocalStoredCategories(organizationId);
    if (!existing.some((c) => c.toLowerCase() === formatted.toLowerCase())) {
      existing.push(formatted);
      window.localStorage.setItem(`mediflow_medicine_categories_${organizationId}`, JSON.stringify(existing));
    }
  } catch {}
}

export async function fetchMedicineCategories(organizationId?: string | null): Promise<string[]> {
  const map = new Map<string, string>();

  // 1. Defaults
  DEFAULT_MEDICINE_CATEGORIES.forEach((cat) => {
    map.set(cat.toLowerCase(), cat);
  });

  // 2. Local Storage
  if (organizationId) {
    getLocalStoredCategories(organizationId).forEach((cat) => {
      const key = cat.toLowerCase();
      if (!map.has(key)) map.set(key, cat);
    });
  }

  // 3. Supabase tables
  if (supabase && organizationId) {
    // A. Query distinct categories from products table
    try {
      const { data: prods } = await supabase
        .from("products")
        .select("category")
        .eq("organization_id", organizationId)
        .not("category", "is", null);

      if (prods && Array.isArray(prods)) {
        prods.forEach((row: any) => {
          const val = row?.category ? String(row.category).trim() : "";
          if (val) {
            const key = val.toLowerCase();
            if (!map.has(key)) {
              map.set(key, formatCategoryName(val));
            }
          }
        });
      }
    } catch {}

    // B. Query dedicated medicine_categories table if it exists
    try {
      const { data: cats } = await supabase
        .from("medicine_categories")
        .select("name")
        .eq("organization_id", organizationId);

      if (cats && Array.isArray(cats)) {
        cats.forEach((row: any) => {
          const val = row?.name ? String(row.name).trim() : "";
          if (val) {
            const key = val.toLowerCase();
            if (!map.has(key)) {
              map.set(key, formatCategoryName(val));
            }
          }
        });
      }
    } catch {
      // Table may not exist yet, products table is primary
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

export async function saveNewMedicineCategory(
  organizationId: string | undefined | null,
  rawName: string
): Promise<string> {
  const formatted = formatCategoryName(rawName);
  if (!formatted) return "";

  // Always save to localStorage immediately
  if (organizationId) {
    setLocalStoredCategory(organizationId, formatted);
  }

  // Attempt save to dedicated table in Supabase
  if (supabase && organizationId) {
    try {
      await supabase.from("medicine_categories").insert({
        organization_id: organizationId,
        name: formatted,
        active: true,
      });
    } catch {
      // Gracefully ignore if table does not exist
    }
  }

  return formatted;
}

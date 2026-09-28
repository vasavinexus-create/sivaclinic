import { supabase } from "./supabase";

export function canDeleteBill(role: string, billDate: string, status: string) {
  if (!["completed", "partially_returned", "returned"].includes(status)) return false;
  if (role === "admin") return true;
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(billDate) ? billDate : format.format(new Date(billDate));
  return date === format.format(new Date());
}

export async function cancelBill(kind: "sale" | "purchase", id: string, reason: string) {
  if (!supabase) throw new Error("Database connection is unavailable");
  const { error } = await supabase.rpc("cancel_bill", { p_kind: kind, p_bill_id: id, p_reason: reason });
  if (error) throw new Error(error.message.includes("Could not find the function")
    ? "Install the bill cancellation database migration before deleting bills."
    : error.message);
}

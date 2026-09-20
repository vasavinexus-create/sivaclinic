import { supabase } from "../../../lib/supabase";
import { Profile } from "./types";

function voucherNo(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

export async function postJournal(profile: Profile, args: { voucherType: string; entryDate: string; referenceType: string; referenceId?: string; referenceNumber?: string; narration: string; lines: Array<{ ledger: string; debit?: number; credit?: number; account_ledger_id?: string | null }> }) {
  if (!supabase) return;
  const debit = args.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = args.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.round(debit * 100) !== Math.round(credit * 100)) throw new Error("Journal not balanced");
  const { data, error } = await supabase.from("journal_entries").insert({
    organization_id: profile.organization_id,
    voucher_no: voucherNo(args.voucherType.toUpperCase().slice(0, 3)),
    voucher_type: args.voucherType,
    entry_date: args.entryDate.slice(0, 10),
    narration: args.narration,
    reference_type: args.referenceType,
    reference_id: args.referenceId || null,
    reference_number: args.referenceNumber || null,
    created_by: profile.id,
  }).select("id").single();
  if (error || !data) throw error || new Error("Journal entry failed");
  const lines = args.lines.filter((line) => Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0).map((line, index) => ({
    organization_id: profile.organization_id,
    journal_entry_id: data.id,
    account_ledger_id: line.account_ledger_id || null,
    ledger_name: line.ledger,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    line_order: index + 1,
  }));
  if (lines.length) await supabase.from("journal_lines").insert(lines);
}

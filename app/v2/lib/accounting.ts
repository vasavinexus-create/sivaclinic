import { supabase } from "../../../lib/supabase";
import { Profile } from "./types";

const LEDGER_ALIASES: Record<string, string> = {
  Purchases: "Purchase",
  "Accounts Payable": "Supplier Payable",
  "Accounts Receivable": "Patient Receivable",
};

function normalizeLedger(name: string) {
  const trimmed = String(name || "").trim();
  return LEDGER_ALIASES[trimmed] || trimmed;
}

function voucherNo(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

export async function postJournal(profile: Profile, args: { voucherType: string; entryDate: string; referenceType: string; referenceId?: string; referenceNumber?: string; narration: string; lines: Array<{ ledger: string; debit?: number; credit?: number; account_ledger_id?: string | null }> }) {
  if (!supabase) return;
  const normalizedLines = args.lines
    .map((line) => ({
      ...line,
      ledger: normalizeLedger(line.ledger),
      debit: Number(Number(line.debit || 0).toFixed(2)),
      credit: Number(Number(line.credit || 0).toFixed(2)),
    }))
    .filter((line) => line.debit > 0 || line.credit > 0);

  if (!normalizedLines.length) return;

  const debit = Number(normalizedLines.reduce((sum, line) => sum + line.debit, 0).toFixed(2));
  const credit = Number(normalizedLines.reduce((sum, line) => sum + line.credit, 0).toFixed(2));
  const diff = Number((debit - credit).toFixed(2));

  if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05) {
    // Auto-adjust minor rounding drift on the last credit or debit line
    const targetLine = [...normalizedLines].reverse().find((l) => (diff > 0 ? l.credit > 0 : l.debit > 0));
    if (targetLine) {
      if (diff > 0) targetLine.credit = Number((targetLine.credit + diff).toFixed(2));
      else targetLine.debit = Number((targetLine.debit + Math.abs(diff)).toFixed(2));
    }
  } else if (Math.round(debit * 100) !== Math.round(credit * 100)) {
    throw new Error(`Journal not balanced (Dr: ${debit}, Cr: ${credit})`);
  }

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
  const lines = normalizedLines.map((line, index) => ({
    organization_id: profile.organization_id,
    journal_entry_id: data.id,
    account_ledger_id: line.account_ledger_id || null,
    ledger_name: line.ledger,
    debit: line.debit,
    credit: line.credit,
    line_order: index + 1,
  }));
  if (lines.length) await supabase.from("journal_lines").insert(lines);
}

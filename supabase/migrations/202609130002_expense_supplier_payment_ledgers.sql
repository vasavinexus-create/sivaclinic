alter table public.expenses
  add column if not exists account_ledger_id uuid references public.account_ledgers(id);

alter table public.supplier_payments
  add column if not exists account_ledger_id uuid references public.account_ledgers(id);

create index if not exists expenses_account_ledger_idx on public.expenses (organization_id, account_ledger_id, expense_date desc);
create index if not exists supplier_payments_account_ledger_idx on public.supplier_payments (organization_id, account_ledger_id, paid_on desc);

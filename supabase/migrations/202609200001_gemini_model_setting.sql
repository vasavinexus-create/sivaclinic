do $$
begin
  if to_regclass('public.organizations') is not null then
    alter table public.organizations
      add column if not exists gemini_model text not null default 'gemini-3.6-flash';
  end if;
end $$;

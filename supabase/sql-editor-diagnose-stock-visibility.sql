-- Diagnose why Suppliers / Products / Purchases / Inventory are not visible.
-- Run this in Supabase SQL Editor.
--
-- Most common reason:
-- records exist, but their organization_id is different from the logged-in
-- user's profile.organization_id, so RLS hides them in the app.

-- 1. See which clinic each login belongs to.
select
  u.email,
  p.id as profile_id,
  p.full_name,
  p.role,
  p.active,
  p.organization_id,
  o.clinic_name
from auth.users u
left join public.profiles p on p.id = u.id
left join public.organizations o on o.id = p.organization_id
where lower(u.email) in (
  'vasavinexus@gmail.com',
  'sivasankarnagarajan199763@gmail.com'
)
order by u.email;

-- 2. See where stock/purchase data is stored.
select
  o.id as organization_id,
  o.clinic_name,
  (select count(*) from public.suppliers s where s.organization_id = o.id) as suppliers,
  (select count(*) from public.products pr where pr.organization_id = o.id) as products,
  (select count(*) from public.purchases pu where pu.organization_id = o.id) as purchases,
  (select count(*) from public.purchase_items pi where pi.organization_id = o.id) as purchase_items,
  (select count(*) from public.medicine_batches mb where mb.organization_id = o.id) as inventory_batches,
  (select coalesce(sum(mb.current_stock),0) from public.medicine_batches mb where mb.organization_id = o.id) as stock_qty
from public.organizations o
order by o.created_at desc;

-- 3. Check if purchase child rows point to records in a different clinic.
select
  'purchase_items_org_mismatch' as issue,
  count(*) as rows
from public.purchase_items pi
join public.purchases pu on pu.id = pi.purchase_id
where pi.organization_id <> pu.organization_id
union all
select
  'batch_purchase_org_mismatch' as issue,
  count(*) as rows
from public.medicine_batches mb
join public.purchases pu on pu.id = mb.purchase_id
where mb.organization_id <> pu.organization_id
union all
select
  'batch_product_org_mismatch' as issue,
  count(*) as rows
from public.medicine_batches mb
join public.products pr on pr.id = mb.product_id
where mb.organization_id <> pr.organization_id;

-- 4. If the admin login belongs to one clinic but the imported bill data is
-- in another clinic, tell me the output of section 1 and 2. Then I can give
-- you the exact safe UPDATE script to move those records to the right clinic.

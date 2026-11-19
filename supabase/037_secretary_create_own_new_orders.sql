-- ============================================================
-- 037 — السكرتير يقدر يضيف طلب شراء جديد (وبنوده وصوره) بتاعه هو بس
-- - purchase_orders.created_by: مين أنشأ الأمر
-- - السكرتير يقدر يضيف أمر (في قسمه) وبنود/صور للأمر اللي هو أنشأه
--   طالما الأمر لسه بحالة "جديد"
-- - باقي التعديل والحذف والتوريد: المدير بس (036) — وقسم الشراء للتوريد
-- Restrictive policies are ANDed with the existing permissive ones.
-- Safe to re-run.
-- ============================================================

alter table public.purchase_orders add column if not exists created_by uuid default auth.uid();

create or replace function public.is_own_new_order(p_order_id bigint)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.purchase_orders o
    where o.id = p_order_id
      and o.created_by = auth.uid()
      and o.status = 'جديد');
$$;

-- purchase_orders insert: manager, or secretary creating an order for their own department
drop policy if exists po_manager_only_insert on public.purchase_orders;
create policy po_create_insert on public.purchase_orders
  as restrictive for insert to authenticated
  with check (
    public.is_manager_only()
    or (current_user_role() = 'secretary' and department = my_department()));

-- purchase_items insert: manager, or secretary adding items to his own new order
drop policy if exists pi_manager_only_insert on public.purchase_items;
create policy pi_create_insert on public.purchase_items
  as restrictive for insert to authenticated
  with check (
    public.is_manager_only()
    or (current_user_role() = 'secretary' and public.is_own_new_order(purchase_order_id)));

-- order images insert: same rule as items
drop policy if exists poi_manager_only_insert on public.purchase_order_images;
create policy poi_create_insert on public.purchase_order_images
  as restrictive for insert to authenticated
  with check (
    public.is_manager_only()
    or (current_user_role() = 'secretary' and public.is_own_new_order(purchase_order_id)));

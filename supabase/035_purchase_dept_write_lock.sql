-- ============================================================
-- 035 — قسم الشراء (department = purchase): توريد بس، مفيش تعديل في الداتابيز
-- Purchase dept can READ purchase orders (034) and UPDATE purchase items
-- (to record received quantities / status / supply date).
-- Everything else (insert / delete items, edit / add / delete orders,
-- add / remove order images) is blocked by restrictive policies.
-- Restrictive policies are ANDed with the existing permissive ones.
-- Safe to re-run.
-- ============================================================

create or replace function public.is_purchase_dept()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select lower(coalesce(my_department(), '')) = 'purchase';
$$;

-- purchase_items: keep update (receiving), block insert and delete
drop policy if exists pi_purchase_dept_lock_insert on public.purchase_items;
create policy pi_purchase_dept_lock_insert on public.purchase_items
  as restrictive for insert to authenticated
  with check (not public.is_purchase_dept());

drop policy if exists pi_purchase_dept_lock_delete on public.purchase_items;
create policy pi_purchase_dept_lock_delete on public.purchase_items
  as restrictive for delete to authenticated
  using (not public.is_purchase_dept());

-- purchase_orders: read only for purchase dept
drop policy if exists po_purchase_dept_lock_insert on public.purchase_orders;
create policy po_purchase_dept_lock_insert on public.purchase_orders
  as restrictive for insert to authenticated
  with check (not public.is_purchase_dept());

drop policy if exists po_purchase_dept_lock_update on public.purchase_orders;
create policy po_purchase_dept_lock_update on public.purchase_orders
  as restrictive for update to authenticated
  using (not public.is_purchase_dept())
  with check (not public.is_purchase_dept());

drop policy if exists po_purchase_dept_lock_delete on public.purchase_orders;
create policy po_purchase_dept_lock_delete on public.purchase_orders
  as restrictive for delete to authenticated
  using (not public.is_purchase_dept());

-- order images: read only for purchase dept
drop policy if exists poi_purchase_dept_lock_insert on public.purchase_order_images;
create policy poi_purchase_dept_lock_insert on public.purchase_order_images
  as restrictive for insert to authenticated
  with check (not public.is_purchase_dept());

drop policy if exists poi_purchase_dept_lock_update on public.purchase_order_images;
create policy poi_purchase_dept_lock_update on public.purchase_order_images
  as restrictive for update to authenticated
  using (not public.is_purchase_dept())
  with check (not public.is_purchase_dept());

drop policy if exists poi_purchase_dept_lock_delete on public.purchase_order_images;
create policy poi_purchase_dept_lock_delete on public.purchase_order_images
  as restrictive for delete to authenticated
  using (not public.is_purchase_dept());

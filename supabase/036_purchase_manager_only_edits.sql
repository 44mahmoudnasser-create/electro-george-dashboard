-- ============================================================
-- 036 — طلبات الشراء: التعديل للمدير بس، والتوريد للمدير وقسم الشراء
-- - أي تعديل (أوامر / بنود / صور): المدير (role = manager) بس
-- - التوريد (تحديث البند: الكمية المستلمة / الحالة / تاريخ التوريد):
--   المدير وقسم الشراء (department = purchase)
-- Restrictive policies are ANDed with the existing permissive ones.
-- Safe to re-run.
-- ============================================================

create or replace function public.is_manager_only()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select current_user_role() = 'manager';
$$;

create or replace function public.can_receive_purchases()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select current_user_role() = 'manager' or lower(coalesce(my_department(), '')) = 'purchase';
$$;

-- purchase_items: insert / delete = manager only; update (receiving) = manager + purchase
drop policy if exists pi_manager_only_insert on public.purchase_items;
create policy pi_manager_only_insert on public.purchase_items
  as restrictive for insert to authenticated
  with check (public.is_manager_only());

drop policy if exists pi_manager_only_delete on public.purchase_items;
create policy pi_manager_only_delete on public.purchase_items
  as restrictive for delete to authenticated
  using (public.is_manager_only());

drop policy if exists pi_receive_only_update on public.purchase_items;
create policy pi_receive_only_update on public.purchase_items
  as restrictive for update to authenticated
  using (public.can_receive_purchases())
  with check (public.can_receive_purchases());

-- purchase_orders: insert / update / delete = manager only
drop policy if exists po_manager_only_insert on public.purchase_orders;
create policy po_manager_only_insert on public.purchase_orders
  as restrictive for insert to authenticated
  with check (public.is_manager_only());

drop policy if exists po_manager_only_update on public.purchase_orders;
create policy po_manager_only_update on public.purchase_orders
  as restrictive for update to authenticated
  using (public.is_manager_only())
  with check (public.is_manager_only());

drop policy if exists po_manager_only_delete on public.purchase_orders;
create policy po_manager_only_delete on public.purchase_orders
  as restrictive for delete to authenticated
  using (public.is_manager_only());

-- purchase_order_images: insert / update / delete = manager only
drop policy if exists poi_manager_only_insert on public.purchase_order_images;
create policy poi_manager_only_insert on public.purchase_order_images
  as restrictive for insert to authenticated
  with check (public.is_manager_only());

drop policy if exists poi_manager_only_update on public.purchase_order_images;
create policy poi_manager_only_update on public.purchase_order_images
  as restrictive for update to authenticated
  using (public.is_manager_only())
  with check (public.is_manager_only());

drop policy if exists poi_manager_only_delete on public.purchase_order_images;
create policy poi_manager_only_delete on public.purchase_order_images
  as restrictive for delete to authenticated
  using (public.is_manager_only());

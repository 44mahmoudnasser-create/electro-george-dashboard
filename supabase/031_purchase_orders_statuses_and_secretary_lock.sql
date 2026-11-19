-- ============================================================
-- 031 — طلبات الشراء: 4 حالات + قفل تعديل السكرتير
-- Statuses on purchase_orders: جديد / مفتوح / تم التوريد / تم التوريد جزئيا
-- Secretary can create and edit orders and items, EXCEPT when the order is
-- "تم التوريد جزئيا" (locked for secretary). Admin and manager are not affected.
-- Restrictive policies are ANDed with the existing permissive policies.
-- Safe to re-run.
-- ============================================================

alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status in ('جديد', 'مفتوح', 'تم التوريد', 'تم التوريد جزئيا'));

-- Order header: secretary cannot update / delete a partially supplied order
drop policy if exists po_secretary_lock_update on public.purchase_orders;
create policy po_secretary_lock_update on public.purchase_orders
  as restrictive for update to authenticated
  using (not (current_user_role() = 'secretary' and status = 'تم التوريد جزئيا'))
  with check (not (current_user_role() = 'secretary' and status = 'تم التوريد جزئيا'));

drop policy if exists po_secretary_lock_delete on public.purchase_orders;
create policy po_secretary_lock_delete on public.purchase_orders
  as restrictive for delete to authenticated
  using (not (current_user_role() = 'secretary' and status = 'تم التوريد جزئيا'));

-- Helper (definer, so it can read the parent order regardless of RLS)
create or replace function public.po_locked_for_current_user(p_order_id bigint)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select current_user_role() = 'secretary' and exists (
    select 1 from public.purchase_orders o
    where o.id = p_order_id and o.status = 'تم التوريد جزئيا');
$$;

-- Items of a locked order: secretary cannot add, edit or delete them
drop policy if exists pi_secretary_lock_insert on public.purchase_items;
create policy pi_secretary_lock_insert on public.purchase_items
  as restrictive for insert to authenticated
  with check (not public.po_locked_for_current_user(purchase_order_id));

drop policy if exists pi_secretary_lock_update on public.purchase_items;
create policy pi_secretary_lock_update on public.purchase_items
  as restrictive for update to authenticated
  using (not public.po_locked_for_current_user(purchase_order_id))
  with check (not public.po_locked_for_current_user(purchase_order_id));

drop policy if exists pi_secretary_lock_delete on public.purchase_items;
create policy pi_secretary_lock_delete on public.purchase_items
  as restrictive for delete to authenticated
  using (not public.po_locked_for_current_user(purchase_order_id));

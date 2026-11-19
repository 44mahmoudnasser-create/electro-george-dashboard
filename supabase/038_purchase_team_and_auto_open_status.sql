-- ============================================================
-- 038 — فريق الشراء: قسم purchase + قسم supmanager
-- - الاتنين يقدروا يشوفوا أوامر الشراء ويسجلوا التوريد ويحطوا التاريخ المتوقع
-- - لما أي بند ياخد تاريخ متوقع أو تاريخ توريد، حالة الأمر (لو "جديد") تبقى "مفتوح"
-- Safe to re-run.
-- ============================================================

create or replace function public.is_purchase_team()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select lower(coalesce(my_department(), '')) in ('purchase', 'supmanager');
$$;

-- قراءة الأوامر لفريق الشراء
drop policy if exists po_purchase_dept_read on public.purchase_orders;
create policy po_purchase_dept_read on public.purchase_orders
  for select to authenticated
  using (public.is_purchase_team());

-- التوريد وتحديث البنود (التاريخ المتوقع / التوريد) للمدير وفريق الشراء
create or replace function public.can_receive_purchases()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select current_user_role() = 'manager' or public.is_purchase_team();
$$;

-- الأمر يتحول "مفتوح" أول ما أي بند فيه تاريخ متوقع أو تاريخ توريد
create or replace function public.open_order_on_item_dates()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.expected_supply_date is not null or new.supply_date is not null then
    update public.purchase_orders
       set status = 'مفتوح'
     where id = new.purchase_order_id
       and status = 'جديد';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_items_open_order on public.purchase_items;
create trigger purchase_items_open_order
  after insert or update of expected_supply_date, supply_date on public.purchase_items
  for each row execute function public.open_order_on_item_dates();

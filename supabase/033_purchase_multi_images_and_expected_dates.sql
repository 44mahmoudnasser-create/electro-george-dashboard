-- ============================================================
-- 033 — طلبات الشراء: أكتر من صورة للأمر + تاريخ توريد متوقع لكل بند
-- 1) purchase_order_images: صور متعددة لكل أمر (الصورة الواحدة القديمة بتتنقل تلقائي)
--    الأمر لازم يبقى فيه صورة واحدة على الأقل (بتتفرض في الواجهة)
-- 2) purchase_items.expected_supply_date: التاريخ المتوقع للتوريد لكل بند
--    supply_date بقى التاريخ الفعلي للتوريد
-- Secretary lock from 031 also applies to the images of a partially supplied order.
-- Safe to re-run.
-- ============================================================

-- 2) expected date per item
alter table public.purchase_items add column if not exists expected_supply_date date;

-- existing open items: their supply_date was the expected date
update public.purchase_items
   set expected_supply_date = supply_date
 where expected_supply_date is null
   and status <> 'تم التوريد'
   and supply_date is not null;

-- 1) multiple images per order
create table if not exists public.purchase_order_images (
  id                 bigint generated always as identity primary key,
  purchase_order_id  bigint not null references public.purchase_orders(id) on delete cascade,
  image_path         text not null,
  created_at         timestamptz not null default now()
);

-- move the old single image into the new table (once)
insert into public.purchase_order_images (purchase_order_id, image_path)
select o.id, o.image_path
  from public.purchase_orders o
 where o.image_path is not null
   and not exists (
     select 1 from public.purchase_order_images i
     where i.purchase_order_id = o.id and i.image_path = o.image_path);

alter table public.purchase_order_images enable row level security;

-- visible when the parent order is visible to the user (parent RLS applies)
drop policy if exists poi_read on public.purchase_order_images;
create policy poi_read on public.purchase_order_images
  for select to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id));

drop policy if exists poi_write on public.purchase_order_images;
create policy poi_write on public.purchase_order_images
  for all to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id))
  with check (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id));

-- secretary cannot add / remove images of a partially supplied order (same lock as 031)
drop policy if exists poi_secretary_lock_insert on public.purchase_order_images;
create policy poi_secretary_lock_insert on public.purchase_order_images
  as restrictive for insert to authenticated
  with check (not public.po_locked_for_current_user(purchase_order_id));

drop policy if exists poi_secretary_lock_update on public.purchase_order_images;
create policy poi_secretary_lock_update on public.purchase_order_images
  as restrictive for update to authenticated
  using (not public.po_locked_for_current_user(purchase_order_id))
  with check (not public.po_locked_for_current_user(purchase_order_id));

drop policy if exists poi_secretary_lock_delete on public.purchase_order_images;
create policy poi_secretary_lock_delete on public.purchase_order_images
  as restrictive for delete to authenticated
  using (not public.po_locked_for_current_user(purchase_order_id));

-- ============================================================
-- 034 — طلبات الشراء: توريد جزئي بالكمية + صلاحية قسم الشراء
-- 1) purchase_items.received_qty: الكمية اللي اتوردت فعلاً (تراكمي)
--    حالة البند: مفتوح / تم التوريد جزئيا / تم التوريد / ملغي
-- 2) قسم "purchase" يقدر يشوف كل أوامر الشراء (عشان يسجل التوريد عليها)
--    التعديل على الأوامر والبنود بيتقفل من الواجهة لقسم الشراء
-- Safe to re-run.
-- ============================================================

alter table public.purchase_items add column if not exists received_qty numeric not null default 0;

-- البنود اللي اتسجلت "تم التوريد" قبل كده: الكمية المستلمة = الكمية المطلوبة
update public.purchase_items
   set received_qty = quantity
 where status = 'تم التوريد' and received_qty = 0;

alter table public.purchase_items drop constraint if exists purchase_items_status_check;
alter table public.purchase_items add constraint purchase_items_status_check
  check (status in ('مفتوح', 'تم التوريد جزئيا', 'تم التوريد', 'ملغي'));

-- قسم الشراء يشوف كل الأوامر (مش قسمه بس)
drop policy if exists po_purchase_dept_read on public.purchase_orders;
create policy po_purchase_dept_read on public.purchase_orders
  for select to authenticated
  using (lower(coalesce(my_department(), '')) = 'purchase');

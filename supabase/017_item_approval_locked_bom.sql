-- ============================================================
-- 017 — اعتماد على مستوى البند + Total BOM مقفول
-- • مكتب التصميم بيعمل الأمر مع Total BOM مرة واحدة (create_work_order_design)، وبعدها الـ Total BOM مقفول خالص
-- • كل بند ليه دورة: draft → pending (ارسال) → approved (اعتماد). البند المرسل يتقفل
-- • BOM وقائمة الإنتاج للبند بيتضافوا بعد اعتماد البند بس، ومكتب التصميم هو اللي بيضيفهم
-- • إلغاء اعتماد الأمر كله (016): الحالة "في انتظار الاعتماد" والأوقات على الأمر اتشالوا
-- Safe to re-run.
-- ============================================================

-- 1) رجوع الحالة اللي اتعملت بالمسار القديم
update public.work_orders set status = 'لم يبدأ' where status = 'في انتظار الاعتماد';
alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders add constraint work_orders_status_check
  check (status in ('لم يبدأ','جاري','متوقف','مكتمل','تم التسليم'));

-- 2) شيل تريجرات وفنكشنز المسار القديم
drop trigger if exists trg_guard_items on public.work_order_items;
drop trigger if exists trg_guard_total_bom on public.wo_total_bom;
drop trigger if exists trg_guard_bom_items on public.wo_bom_items;
drop trigger if exists trg_guard_prod_items on public.wo_production_items;
drop trigger if exists trg_guard_work_orders on public.work_orders;
drop function if exists public.guard_design_children();
drop function if exists public.design_send_for_approval(bigint);
drop function if exists public.design_approve(bigint);

-- 3) شيل أوقات الاعتماد من الأمر
alter table public.work_orders drop column if exists design_sent_at;
alter table public.work_orders drop column if exists design_sent_by;
alter table public.work_orders drop column if exists design_approved_at;
alter table public.work_orders drop column if exists design_approved_by;

-- 4) سجل الحالات: يدعم البند كمان
alter table public.wo_status_history add column if not exists item_id bigint references public.work_order_items(id) on delete set null;
alter table public.wo_status_history drop constraint if exists wo_status_history_scope_check;
alter table public.wo_status_history add constraint wo_status_history_scope_check
  check (scope in ('department','work_order','item'));

-- 5) حالة البند ووقت/اسم الإرسال والاعتماد
alter table public.work_order_items add column if not exists status       text not null default 'draft';
alter table public.work_order_items add column if not exists sent_at      timestamptz;
alter table public.work_order_items add column if not exists sent_by      uuid references public.app_users(id);
alter table public.work_order_items add column if not exists approved_at  timestamptz;
alter table public.work_order_items add column if not exists approved_by  uuid references public.app_users(id);
alter table public.work_order_items drop constraint if exists work_order_items_status_check;
alter table public.work_order_items add constraint work_order_items_status_check
  check (status in ('draft','pending','approved'));

-- البنود القديمة (قبل الاعتماد الجديد) بتعتبر معتمدة من غير تاريخ محدد
update public.work_order_items set status = 'approved', approved_at = coalesce(approved_at, created_at)
 where status = 'draft' and approved_at is null and created_at < now() - interval '1 minute';

-- ───────────── helper ─────────────
create or replace function public.is_design_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users u
                  where u.id = auth.uid() and public.resolve_department(u.department) = 'DESIGN')
$$;

-- ───────────── حماية الأمر: الإنشاء بالدالة بس، والتعديل للمدير بس ─────────────
create or replace function public.guard_work_orders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;      -- SQL Editor / صيانة
  select role into v_role from public.app_users where id = auth.uid();
  if v_role = 'manager' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and coalesce(current_setting('eg.wo_create', true), '') = 'on' then
    return new;
  end if;
  raise exception 'إضافة وتعديل أوامر الشغل للمدير بس';
end $$;

drop trigger if exists trg_guard_work_orders on public.work_orders;
create trigger trg_guard_work_orders before insert or update on public.work_orders
  for each row execute function public.guard_work_orders();

-- ───────────── Total BOM: يتكتب مرة واحدة مع الأمر، وبعدها مقفول ─────────────
create or replace function public.guard_wo_total_bom()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and coalesce(current_setting('eg.total_bom_create', true), '') = 'on' then
    return new;
  end if;
  -- الحذف اللي بيجي من مسح الأمر نفسه (cascade) مسموح
  if tg_op = 'DELETE' and not exists (select 1 from public.work_orders where id = old.wo_id) then
    return old;
  end if;
  raise exception 'Total BOM مقفول: مايتعدلش ولا يتضافش عليه بند';
end $$;

drop trigger if exists trg_guard_wo_total_bom on public.wo_total_bom;
create trigger trg_guard_wo_total_bom before insert or update or delete on public.wo_total_bom
  for each row execute function public.guard_wo_total_bom();

-- ───────────── البنود: إضافة للمدير ومكتب التصميم، والمرسل/المعتمد مقفول ─────────────
create or replace function public.guard_work_order_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_flow boolean := coalesce(current_setting('eg.item_flow', true), '') = 'on';
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if v_flow then return coalesce(new, old); end if;
  select role into v_role from public.app_users where id = auth.uid();
  if v_role is distinct from 'manager' and not public.is_design_user() then
    raise exception 'مش مسموحلك تعدّل البنود';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'البند بيتضاف كمسودة بس'; end if;
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'البند اتبعت للاعتماد، مايتعدلش ولا يتمسح';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'حالة البند بتتغير من زراير الإرسال والاعتماد بس';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_guard_work_order_items on public.work_order_items;
create trigger trg_guard_work_order_items before insert or update or delete on public.work_order_items
  for each row execute function public.guard_work_order_items();

-- ───────────── BOM وقائمة الإنتاج للبند: مكتب التصميم بعد اعتماد البند بس ─────────────
create or replace function public.guard_item_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_status text;
begin
  if auth.uid() is null then return new; end if;
  if tg_op <> 'INSERT' then return coalesce(new, old); end if;   -- التعديل على الكميات (تسجيل الإنتاج والصرف) مش بيتقفل هنا
  select role into v_role from public.app_users where id = auth.uid();
  if v_role = 'manager' then return new; end if;
  if not public.is_design_user() then
    raise exception 'الإضافة لمكتب التصميم بس';
  end if;
  select status into v_status from public.work_order_items where id = new.work_order_item_id;
  if v_status is distinct from 'approved' then
    raise exception 'مايتضافش BOM ولا قائمة إنتاج للبند قبل اعتماده';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_item_children_bom on public.wo_bom_items;
create trigger trg_guard_item_children_bom before insert on public.wo_bom_items
  for each row execute function public.guard_item_children();
drop trigger if exists trg_guard_item_children_prod on public.wo_production_items;
create trigger trg_guard_item_children_prod before insert on public.wo_production_items
  for each row execute function public.guard_item_children();

-- ───────────── إنشاء أمر من مكتب التصميم مع Total BOM (مرة واحدة) ─────────────
create or replace function public.create_work_order_design(
  p_wo_number text, p_description text, p_expected_delivery date,
  p_plan_month text, p_priority text, p_total_bom jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_id   bigint;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or public.resolve_department(v_user.department) is distinct from 'DESIGN' then
    raise exception 'إنشاء الأمر من مكتب التصميم بس';
  end if;
  if p_total_bom is null or jsonb_typeof(p_total_bom) <> 'array' or jsonb_array_length(p_total_bom) = 0 then
    raise exception 'لازم يكون فيه Total BOM فيه سطر واحد على الأقل';
  end if;

  perform set_config('eg.wo_create', 'on', true);
  insert into public.work_orders (wo_number, description, expected_delivery, plan_month, priority, status, created_date)
  values (p_wo_number, nullif(p_description, ''), p_expected_delivery, nullif(p_plan_month, ''),
          coalesce(nullif(p_priority, ''), 'متوسطة'), 'لم يبدأ', current_date)
  returning id into v_id;
  perform set_config('eg.wo_create', 'off', true);

  perform set_config('eg.total_bom_create', 'on', true);
  insert into public.wo_total_bom (wo_id, s_no, qty, unit, description, part_no, remark, created_by)
  select v_id,
         nullif(e->>'s_no', '')::int,
         coalesce(nullif(e->>'qty', '')::numeric, 1),
         nullif(e->>'unit', ''),
         e->>'description',
         nullif(e->>'part_no', ''),
         nullif(e->>'remark', ''),
         v_user.id
  from jsonb_array_elements(p_total_bom) e;
  perform set_config('eg.total_bom_create', 'off', true);

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by, note)
  values (v_id, 'work_order', 'DESIGN', null, 'لم يبدأ', v_user.id, 'إنشاء الأمر مع Total BOM');

  return jsonb_build_object('id', v_id);
end $$;

-- ───────────── إرسال بند للاعتماد ─────────────
create or replace function public.design_send_item(p_item_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_item public.work_order_items;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or public.resolve_department(v_user.department) is distinct from 'DESIGN' then
    raise exception 'الإرسال للاعتماد لمكتب التصميم بس';
  end if;
  select * into v_item from public.work_order_items where id = p_item_id for update;
  if not found then raise exception 'البند غير موجود'; end if;
  if v_item.status <> 'draft' then raise exception 'البند اتبعت للاعتماد قبل كده'; end if;

  perform set_config('eg.item_flow', 'on', true);
  update public.work_order_items
     set status = 'pending', sent_at = now(), sent_by = v_user.id
   where id = p_item_id;
  perform set_config('eg.item_flow', 'off', true);

  insert into public.wo_status_history (wo_id, scope, item_id, department, from_status, to_status, changed_by, note)
  values (v_item.wo_id, 'item', p_item_id, 'DESIGN', 'draft', 'pending', v_user.id, 'إرسال البند للاعتماد');

  return jsonb_build_object('item_id', p_item_id, 'status', 'pending');
end $$;

-- ───────────── تسجيل اعتماد بند ─────────────
create or replace function public.design_approve_item(p_item_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_item public.work_order_items;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or public.resolve_department(v_user.department) is distinct from 'DESIGN' then
    raise exception 'تسجيل الاعتماد لمكتب التصميم بس';
  end if;
  select * into v_item from public.work_order_items where id = p_item_id for update;
  if not found then raise exception 'البند غير موجود'; end if;
  if v_item.status = 'approved' then raise exception 'البند اتعتمد قبل كده'; end if;
  if v_item.status <> 'pending' then raise exception 'البند لسه مش مرسل للاعتماد'; end if;

  perform set_config('eg.item_flow', 'on', true);
  update public.work_order_items
     set status = 'approved', approved_at = now(), approved_by = v_user.id
   where id = p_item_id;
  perform set_config('eg.item_flow', 'off', true);

  insert into public.wo_status_history (wo_id, scope, item_id, department, from_status, to_status, changed_by, note)
  values (v_item.wo_id, 'item', p_item_id, 'DESIGN', 'pending', 'approved', v_user.id, 'تسجيل اعتماد البند');

  return jsonb_build_object('item_id', p_item_id, 'status', 'approved');
end $$;

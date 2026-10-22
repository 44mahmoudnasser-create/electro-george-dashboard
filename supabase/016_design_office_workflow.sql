-- ============================================================
-- 016 — مكتب التصميم: بنود الأمر + Total BOM + إرسال واعتماد (مقفول بالوقت)
-- • الأمر ليه بنود (work_order_items)، وكل بند ليه BOM وقائمة إنتاج خاصة بيه
-- • مكتب التصميم (DESIGN OFFICE): ينشئ الأمر، يضيف البنود والـ Total BOM، يرسل للاعتماد،
--   ويسجل الاعتماد. بعد الاعتماد يضيف BOM وقائمة إنتاج لكل بند. ماعدا كده ممنوع أي تعديل.
-- • الأوقات (إرسال / اعتماد) مقفولة: مايتغيرش ولا يتمسح حتى للمدير.
-- Safe to re-run.
-- ============================================================

-- 1) قسم مكتب التصميم (مش بيدخل في حالات الأقسام المطلوبة على الأمر)
alter table public.departments add column if not exists in_wo_checks boolean not null default true;

insert into public.departments (code, name_ar, aliases, sort_no, in_wo_checks) values
  ('DESIGN', 'مكتب التصميم', array['DESIGN','DESIGN OFFICE','design','design office','مكتب التصميم'], 10, false)
on conflict (code) do update set in_wo_checks = false;

create or replace function public.seed_wo_departments() returns trigger
language plpgsql as $$
begin
  insert into public.wo_department_status (wo_id, department)
  select new.id, d.code from public.departments d where d.active and d.in_wo_checks
  on conflict do nothing;
  return new;
end $$;

-- 2) حالة جديدة للأمر
alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders add constraint work_orders_status_check
  check (status in ('لم يبدأ','جاري','متوقف','مكتمل','تم التسليم','في انتظار الاعتماد'));

-- 3) أوقات الإرسال والاعتماد
alter table public.work_orders add column if not exists design_sent_at     timestamptz;
alter table public.work_orders add column if not exists design_sent_by     uuid references public.app_users(id);
alter table public.work_orders add column if not exists design_approved_at timestamptz;
alter table public.work_orders add column if not exists design_approved_by uuid references public.app_users(id);

-- 4) بنود الأمر
create table if not exists public.work_order_items (
  id          bigint generated always as identity primary key,
  wo_id       bigint not null references public.work_orders(id) on delete cascade,
  item_no     int    not null,
  description text   not null,
  qty         numeric not null default 1 check (qty > 0),
  part_no     text,
  created_at  timestamptz not null default now(),
  unique (wo_id, item_no)
);

-- الأوامر القديمة: بند افتراضي واحد
insert into public.work_order_items (wo_id, item_no, description, qty)
select w.id, 1, coalesce(nullif(w.description,''), 'البند الرئيسي'), 1
from public.work_orders w
where not exists (select 1 from public.work_order_items i where i.wo_id = w.id)
on conflict do nothing;

-- 5) BOM وقائمة الإنتاج بتتربط بالبند
alter table public.wo_bom_items
  add column if not exists work_order_item_id bigint references public.work_order_items(id) on delete cascade;
alter table public.wo_production_items
  add column if not exists work_order_item_id bigint references public.work_order_items(id) on delete cascade;

update public.wo_bom_items b
   set work_order_item_id = (select i.id from public.work_order_items i
                              where i.wo_id = b.work_order_id order by i.item_no limit 1)
 where b.work_order_item_id is null;

update public.wo_production_items p
   set work_order_item_id = (select i.id from public.work_order_items i
                              where i.wo_id = p.work_order_id order by i.item_no limit 1)
 where p.work_order_item_id is null;

-- أي إدخال قديم من غير بند يتحط على أول بند للأمر (حماية للواجهة القديمة)
create or replace function public.fill_default_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.work_order_item_id is null then
    select i.id into new.work_order_item_id from public.work_order_items i
     where i.wo_id = new.work_order_id order by i.item_no limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_default_item_bom on public.wo_bom_items;
create trigger trg_fill_default_item_bom before insert on public.wo_bom_items
  for each row execute function public.fill_default_item();
drop trigger if exists trg_fill_default_item_prod on public.wo_production_items;
create trigger trg_fill_default_item_prod before insert on public.wo_production_items
  for each row execute function public.fill_default_item();

-- 6) Total BOM على مستوى الأمر
create table if not exists public.wo_total_bom (
  id          bigint generated always as identity primary key,
  wo_id       bigint not null references public.work_orders(id) on delete cascade,
  s_no        int,
  qty         numeric not null default 1 check (qty > 0),
  unit        text,
  description text not null,
  part_no     text,
  remark      text,
  created_by  uuid references public.app_users(id),
  created_at  timestamptz not null default now()
);

-- ───────────── helper ─────────────
create or replace function public.is_design_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users u
                  where u.id = auth.uid() and public.resolve_department(u.department) = 'DESIGN')
$$;

-- ───────────── حماية الأمر ─────────────
create or replace function public.guard_work_orders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_flow boolean := coalesce(current_setting('eg.design_flow', true), '') = 'on';
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- SQL Editor / صيانة
  select role into v_role from public.app_users where id = auth.uid();

  if tg_op = 'INSERT' then
    if v_role = 'manager' then return new; end if;
    if public.is_design_user() and new.design_sent_at is null and new.design_approved_at is null
       and new.status <> 'في انتظار الاعتماد' then
      return new;
    end if;
    raise exception 'مش مسموحلك تضيف أمر شغل';
  end if;

  -- الأوقات مقفولة: مايتغيرش ولا يتمسح، ومايتسجلش إلا من زراير الإرسال والاعتماد
  if old.design_sent_at is not null and new.design_sent_at is distinct from old.design_sent_at then
    raise exception 'وقت الإرسال للاعتماد مقفول';
  end if;
  if old.design_sent_by is not null and new.design_sent_by is distinct from old.design_sent_by then
    raise exception 'بيانات الإرسال للاعتماد مقفولة';
  end if;
  if old.design_approved_at is not null and new.design_approved_at is distinct from old.design_approved_at then
    raise exception 'وقت الاعتماد مقفول';
  end if;
  if old.design_approved_by is not null and new.design_approved_by is distinct from old.design_approved_by then
    raise exception 'بيانات الاعتماد مقفولة';
  end if;
  if (new.design_sent_at is distinct from old.design_sent_at
      or new.design_approved_at is distinct from old.design_approved_at) and not v_flow then
    raise exception 'أوقات الاعتماد بتتسجل من الزراير بس';
  end if;

  -- الحالة "في انتظار الاعتماد" بتتحدد وتتقفل من الزراير بس
  if new.status = 'في انتظار الاعتماد' and old.status is distinct from new.status and not v_flow then
    raise exception 'الحالة دي بتتحدد من زرار "ارسال للاعتماد" بس';
  end if;
  if old.status = 'في انتظار الاعتماد' and new.status is distinct from old.status and not v_flow then
    raise exception 'الأمر في انتظار الاعتماد، والحالة مايتغيرش إلا بتسجيل الاعتماد';
  end if;

  if v_role = 'manager' or v_flow then return new; end if;
  raise exception 'إضافة وتعديل أوامر الشغل للمدير بس';
end $$;

drop trigger if exists trg_guard_work_orders_ins on public.work_orders;
drop trigger if exists trg_guard_work_orders_upd on public.work_orders;
drop trigger if exists trg_guard_work_orders on public.work_orders;
create trigger trg_guard_work_orders before insert or update on public.work_orders
  for each row execute function public.guard_work_orders();

-- ───────────── حماية البنود و Total BOM ─────────────
create or replace function public.guard_design_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   text;
  v_wo_id  bigint;
  v_wo     public.work_orders;
  v_table  text := tg_table_name;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select role into v_role from public.app_users where id = auth.uid();
  if v_role = 'manager' then return coalesce(new, old); end if;
  if not public.is_design_user() then
    raise exception 'مش مسموحلك تعدّل ده';
  end if;

  -- الأمر الأب: wo_id في البنود و Total BOM، و work_order_id في BOM وقائمة الإنتاج
  v_wo_id := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'wo_id')::bigint,
    (to_jsonb(coalesce(new, old)) ->> 'work_order_id')::bigint);
  select * into v_wo from public.work_orders where id = v_wo_id;

  if v_table in ('work_order_items', 'wo_total_bom') then
    if v_wo.design_sent_at is not null then
      raise exception 'الأمر اتبعت للاعتماد، مايتعدلش';
    end if;
  else
    -- BOM وقائمة الإنتاج لكل بند: بعد الاعتماد بس
    if v_wo.design_approved_at is null then
      raise exception 'مايتضافش BOM ولا قائمة إنتاج للبند قبل الاعتماد';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_items on public.work_order_items;
create trigger trg_guard_items before insert or update or delete on public.work_order_items
  for each row execute function public.guard_design_children();
drop trigger if exists trg_guard_total_bom on public.wo_total_bom;
create trigger trg_guard_total_bom before insert or update or delete on public.wo_total_bom
  for each row execute function public.guard_design_children();
drop trigger if exists trg_guard_bom_items on public.wo_bom_items;
create trigger trg_guard_bom_items before insert or update or delete on public.wo_bom_items
  for each row execute function public.guard_design_children();
drop trigger if exists trg_guard_prod_items on public.wo_production_items;
create trigger trg_guard_prod_items before insert or update or delete on public.wo_production_items
  for each row execute function public.guard_design_children();

-- ───────────── إرسال للاعتماد ─────────────
create or replace function public.design_send_for_approval(p_wo_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_wo   public.work_orders;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or public.resolve_department(v_user.department) is distinct from 'DESIGN' then
    raise exception 'زرار الإرسال للاعتماد لمستخدمين مكتب التصميم بس';
  end if;

  select * into v_wo from public.work_orders where id = p_wo_id for update;
  if not found then raise exception 'أمر الشغل غير موجود'; end if;
  if v_wo.design_sent_at is not null then raise exception 'الأمر اتبعت للاعتماد قبل كده'; end if;
  if not exists (select 1 from public.work_order_items where wo_id = p_wo_id) then
    raise exception 'لازم يكون فيه بند واحد على الأقل قبل الإرسال';
  end if;

  perform set_config('eg.design_flow', 'on', true);
  update public.work_orders
     set status = 'في انتظار الاعتماد', design_sent_at = now(), design_sent_by = v_user.id
   where id = p_wo_id;

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by, note)
  values (p_wo_id, 'work_order', 'DESIGN', v_wo.status, 'في انتظار الاعتماد', v_user.id, 'إرسال للاعتماد');

  insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('work_orders', p_wo_id::text, 'UPDATE', v_user.id,
          jsonb_build_object('status', v_wo.status),
          jsonb_build_object('status', 'في انتظار الاعتماد', 'event', 'design_sent'));

  return jsonb_build_object('status', 'في انتظار الاعتماد');
end $$;

-- ───────────── تسجيل الاعتماد ─────────────
create or replace function public.design_approve(p_wo_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_wo   public.work_orders;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or public.resolve_department(v_user.department) is distinct from 'DESIGN' then
    raise exception 'تسجيل الاعتماد لمستخدمين مكتب التصميم بس';
  end if;

  select * into v_wo from public.work_orders where id = p_wo_id for update;
  if not found then raise exception 'أمر الشغل غير موجود'; end if;
  if v_wo.design_approved_at is not null then raise exception 'الأمر اتعتمد قبل كده'; end if;
  if v_wo.design_sent_at is null or v_wo.status <> 'في انتظار الاعتماد' then
    raise exception 'الأمر مش في انتظار الاعتماد';
  end if;

  perform set_config('eg.design_flow', 'on', true);
  update public.work_orders
     set status = 'لم يبدأ', design_approved_at = now(), design_approved_by = v_user.id
   where id = p_wo_id;

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by, note)
  values (p_wo_id, 'work_order', 'DESIGN', v_wo.status, 'لم يبدأ', v_user.id, 'تسجيل الاعتماد');

  insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('work_orders', p_wo_id::text, 'UPDATE', v_user.id,
          jsonb_build_object('status', v_wo.status),
          jsonb_build_object('status', 'لم يبدأ', 'event', 'design_approved'));

  return jsonb_build_object('status', 'لم يبدأ');
end $$;

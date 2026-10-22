-- ============================================================
-- 024 — الحالة العامة + الأولوية + التسليم المتوقع + شهر الخطة + حالة الأقسام: على مستوى البند
-- • كل بند: job_status, priority, expected_delivery, plan_month
-- • حالات الأقسام بقت لكل بند (wo_department_status.item_id)
-- • الحالة العامة للأمر بتتحسب من بنوده تلقائي (work_orders.status بيتحدّث بالـ trigger)
-- • الأعمدة القديمة على الأمر (priority/expected_delivery/plan_month) بتفضل كأرشيف، والواجهة بتقرأ من البند
-- Safe to re-run.
-- ============================================================

-- 1) أعمدة البند الجديدة
alter table public.work_order_items add column if not exists job_status       text not null default 'لم يبدأ';
alter table public.work_order_items add column if not exists priority         text not null default 'متوسطة';
alter table public.work_order_items add column if not exists expected_delivery date;
alter table public.work_order_items add column if not exists plan_month       text;

alter table public.work_order_items drop constraint if exists work_order_items_job_status_check;
alter table public.work_order_items add constraint work_order_items_job_status_check
  check (job_status in ('لم يبدأ','جاري','متوقف','مكتمل','تم التسليم'));
alter table public.work_order_items drop constraint if exists work_order_items_priority_check;
alter table public.work_order_items add constraint work_order_items_priority_check
  check (priority in ('منخفضة','متوسطة','عالية','عاجلة'));

-- 2) الأوامر اللي مالهاش بنود: بند واحد بيتعمل ليها (معتمد) وياخد بيانات الأمر
insert into public.work_order_items (wo_id, item_no, description, qty, status, approved_at)
select w.id, 1, coalesce(nullif(w.description, ''), 'البند الرئيسي'), 1, 'approved', now()
from public.work_orders w
where not exists (select 1 from public.work_order_items i where i.wo_id = w.id);

-- 3) نقل بيانات الأمر للبنود (القيم الحالية بتتنسخ على كل بنوده)
update public.work_order_items i
   set job_status = coalesce(w.status, 'لم يبدأ'),
       priority = coalesce(w.priority, 'متوسطة'),
       expected_delivery = w.expected_delivery,
       plan_month = w.plan_month
  from public.work_orders w
 where w.id = i.wo_id
   and i.job_status = 'لم يبدأ' and i.priority = 'متوسطة'
   and i.expected_delivery is null and i.plan_month is null;

-- 4) حالات الأقسام: لكل بند
alter table public.wo_department_status add column if not exists item_id bigint references public.work_order_items(id) on delete cascade;
update public.wo_department_status d
   set item_id = (select i.id from public.work_order_items i where i.wo_id = d.wo_id order by i.item_no limit 1)
 where d.item_id is null;
delete from public.wo_department_status where item_id is null;   -- لا يوجد بند يتربط بيه = مالوش معنى
alter table public.wo_department_status alter column item_id set not null;
alter table public.wo_department_status drop constraint if exists wo_department_status_pkey;
alter table public.wo_department_status add primary key (item_id, department);

-- 5) تريجر الـ seed: يتنقل من الأمر للبند
drop trigger if exists trg_seed_wo_departments on public.work_orders;
drop function if exists public.seed_wo_departments();

create or replace function public.seed_item_departments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wo_department_status (wo_id, item_id, department)
  select new.wo_id, new.id, d.code from public.departments d
   where d.active and d.in_wo_checks
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_seed_item_departments on public.work_order_items;
create trigger trg_seed_item_departments after insert on public.work_order_items
  for each row execute function public.seed_item_departments();

-- البنود الموجودة: تأكد إن كل بند عنده صفوف الأقسام
insert into public.wo_department_status (wo_id, item_id, department)
select i.wo_id, i.id, d.code from public.work_order_items i
cross join public.departments d
where d.active and d.in_wo_checks
on conflict do nothing;

-- 6) الحالة العامة للأمر من بنوده
create or replace function public.wo_status_from_items(p_wo_id bigint)
returns text language sql stable as $$
  select case
    when count(*) = 0 then 'لم يبدأ'
    when bool_and(job_status = 'تم التسليم') then 'تم التسليم'
    when bool_and(job_status in ('مكتمل','تم التسليم')) then 'مكتمل'
    when bool_and(job_status = 'لم يبدأ') then 'لم يبدأ'
    when bool_or(job_status = 'جاري') then 'جاري'
    when bool_or(job_status = 'متوقف') then 'متوقف'
    else 'جاري'
  end
  from public.work_order_items where wo_id = p_wo_id
$$;

-- الحماية بتسمح بتحديث الأمر من الـ sync بس
create or replace function public.guard_work_orders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;      -- SQL Editor / صيانة
  if coalesce(current_setting('eg.wo_sync', true), '') = 'on' then return coalesce(new, old); end if;

  if public.is_design_user() then
    if tg_op = 'INSERT' and coalesce(current_setting('eg.wo_create', true), '') = 'on' then
      return new;
    end if;
    raise exception 'مكتب التصميم مايقدرش يعدل بيانات الأمر بعد إنشائه';
  end if;

  select role into v_role from public.app_users where id = auth.uid();
  if v_role = 'manager' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and coalesce(current_setting('eg.wo_create', true), '') = 'on' then
    return new;
  end if;
  raise exception 'إضافة وتعديل أوامر الشغل للمدير بس';
end $$;

create or replace function public.sync_wo_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_wo bigint := coalesce(new.wo_id, old.wo_id);
begin
  perform set_config('eg.wo_sync', 'on', true);
  update public.work_orders set status = public.wo_status_from_items(v_wo) where id = v_wo;
  perform set_config('eg.wo_sync', 'off', true);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_sync_wo_status on public.work_order_items;
create trigger trg_sync_wo_status after insert or update or delete on public.work_order_items
  for each row execute function public.sync_wo_status();

-- الأوامر الموجودة: الحالة العامة محسوبة من البنود
update public.work_orders w set status = public.wo_status_from_items(w.id);

-- 7) حماية البنود: بيانات البند (الحالة/الأولوية/التواريخ) للمدير بس، وبنود معتمدة مايتعدلش
create or replace function public.guard_work_order_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_flow boolean := coalesce(current_setting('eg.item_flow', true), '') = 'on';
  v_sync boolean := coalesce(current_setting('eg.wo_sync', true), '') = 'on';
  v_job_changed boolean;
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
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'البند اتبعت للاعتماد، مايتمسحش'; end if;
    return old;
  end if;

  -- تغيير بيانات الحالة/الأولوية/التواريخ: المدير بس، حتى لو البند معتمد
  v_job_changed := (to_jsonb(old) - 'job_status' - 'priority' - 'expected_delivery' - 'plan_month' - 'updated_at')
                <> (to_jsonb(new) - 'job_status' - 'priority' - 'expected_delivery' - 'plan_month' - 'updated_at')
                or old.job_status <> new.job_status or old.priority <> new.priority
                or old.expected_delivery is distinct from new.expected_delivery
                or old.plan_month is distinct from new.plan_month;
  if v_job_changed and not v_sync then
    -- التعديل على الحقول دي: المدير بس، ومايعدّلش وصف/كمية لو البند اتعتمد
    if v_role is distinct from 'manager' then
      raise exception 'بيانات الحالة والأولوية والتواريخ للبند بيعدّلها المدير بس';
    end if;
    if (to_jsonb(old) - 'job_status' - 'priority' - 'expected_delivery' - 'plan_month' - 'updated_at')
       is distinct from (to_jsonb(new) - 'job_status' - 'priority' - 'expected_delivery' - 'plan_month' - 'updated_at') then
      if old.status <> 'draft' then
        raise exception 'البند اتبعت للاعتماد، مايتعدلش';
      end if;
    end if;
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'البند اتبعت للاعتماد، مايتعدلش';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'حالة البند بتتغير من زراير الإرسال والاعتماد بس';
  end if;
  return new;
end $$;

-- 8) حالة قسم على البند
drop function if exists public.set_department_status(bigint, text, text);
create or replace function public.set_item_department_status(p_item_id bigint, p_dept text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user   public.app_users;
  v_mycode text;
  v_item   public.work_order_items;
  v_old    text;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null then raise exception 'لازم تكون مسجل دخول'; end if;
  v_mycode := public.resolve_department(v_user.department);
  if v_user.role <> 'manager' and v_mycode is distinct from p_dept then
    raise exception 'مش مسموحلك تعدّل حالة قسم تاني';
  end if;

  select * into v_item from public.work_order_items where id = p_item_id;
  if not found then raise exception 'البند غير موجود'; end if;

  select status into v_old from public.wo_department_status
   where item_id = p_item_id and department = p_dept for update;
  if not found then raise exception 'القسم ده مش مربوط بالبند ده'; end if;

  update public.wo_department_status
     set status = p_status, updated_by = v_user.id, updated_at = now()
   where item_id = p_item_id and department = p_dept;

  insert into public.wo_status_history (wo_id, scope, item_id, department, from_status, to_status, changed_by)
  values (v_item.wo_id, 'department', p_item_id, p_dept, v_old, p_status, v_user.id);

  insert into public.activity_log (table_name, record_id, action, changed_by, department, old_data, new_data)
  values ('wo_department_status', p_item_id::text || ':' || p_dept, 'UPDATE', v_user.id, p_dept,
          jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));

  return jsonb_build_object('item_id', p_item_id, 'department', p_dept, 'status', p_status);
end $$;

-- 9) الحالة العامة للأمر بقت محسوبة: الـ RPC القديم بيرجع رسالة واضحة
create or replace function public.set_work_order_status(p_wo_id bigint, p_status text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'الحالة العامة للأمر بتتحسب من بنوده، غيّر حالة البند نفسه';
end $$;

notify pgrst, 'reload schema';

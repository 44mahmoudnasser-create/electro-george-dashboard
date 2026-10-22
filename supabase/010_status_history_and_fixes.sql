-- ============================================================
-- 010 — إصلاحات الأقسام + سجل حالات بالوقت (للحسابات بعدين)
-- • إلغاء الـ CHECK على قيم الحالة (القيم بقت حرة، والأقسام مربوطة بجدول departments)
-- • الدوال بقت SECURITY DEFINER: الصلاحيات بتتفحص جوه الدالة، وكتابة activity_log مش بتتحجب بالـ RLS
-- • جدول wo_status_history: كل تغيير حالة (قسم أو أمر) بوقته وبمين عمله
-- Safe to re-run.
-- ============================================================

-- 1) إلغاء الـ CHECK على حالة القسم
alter table public.wo_department_status
  drop constraint if exists wo_department_status_status_check;

-- 2) سجل الحالات بالوقت
create table if not exists public.wo_status_history (
  id           bigint generated always as identity primary key,
  wo_id        bigint not null references public.work_orders(id) on delete cascade,
  scope        text   not null check (scope in ('department','work_order')),
  department   text,                          -- null لو الحالة العامة للأمر
  from_status  text,
  to_status    text   not null,
  changed_by   uuid references public.app_users(id),
  changed_at   timestamptz not null default now(),
  note         text
);
create index if not exists wo_status_history_wo_idx on public.wo_status_history (wo_id, changed_at);

-- 3) تحديث حالة قسم
create or replace function public.set_department_status(p_wo_id bigint, p_dept text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user   public.app_users;
  v_mycode text;
  v_row    public.wo_department_status;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null then raise exception 'لازم تكون مسجل دخول'; end if;
  v_mycode := public.resolve_department(v_user.department);

  if v_user.role not in ('admin','manager') and v_mycode is distinct from p_dept then
    raise exception 'مش مسموحلك تعدّل حالة قسم تاني';
  end if;

  select * into v_row from public.wo_department_status
   where wo_id = p_wo_id and department = p_dept for update;
  if not found then raise exception 'القسم ده مش مطلوب على الأمر ده'; end if;
  if not v_row.applicable then raise exception 'القسم ده مستبعد من الأمر ده'; end if;

  update public.wo_department_status
     set status = p_status, updated_by = v_user.id, updated_at = now()
   where wo_id = p_wo_id and department = p_dept;

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by)
  values (p_wo_id, 'department', p_dept, v_row.status, p_status, v_user.id);

  insert into public.activity_log (table_name, record_id, action, changed_by, department, old_data, new_data)
  values ('wo_department_status', p_wo_id::text || ':' || p_dept, 'UPDATE', v_user.id, p_dept,
          jsonb_build_object('status', v_row.status),
          jsonb_build_object('status', p_status));

  return jsonb_build_object('department', p_dept, 'status', p_status);
end $$;

-- 4) الحالة العامة للأمر (المدير والأدمن)
create or replace function public.set_work_order_status(
  p_wo_id bigint, p_status text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user       public.app_users;
  v_old        text;
  v_incomplete text[];
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or v_user.role not in ('admin','manager') then
    raise exception 'الحالة العامة للأمر بيعدّلها المدير بس';
  end if;

  select status into v_old from public.work_orders where id = p_wo_id for update;
  if not found then raise exception 'أمر الشغل غير موجود'; end if;

  if p_status = 'مكتمل' then
    select coalesce(array_agg(department order by department), '{}') into v_incomplete
      from public.wo_department_status
     where wo_id = p_wo_id and applicable and status <> 'مكتمل';

    if cardinality(v_incomplete) > 0 and not p_force then
      return jsonb_build_object('changed', false, 'needs_confirm', true, 'incomplete', to_jsonb(v_incomplete));
    end if;
  end if;

  update public.work_orders set status = p_status where id = p_wo_id;

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by, note)
  values (p_wo_id, 'work_order', null, v_old, p_status, v_user.id,
          case when cardinality(coalesce(v_incomplete,'{}')) > 0 then 'مكتمل مع أقسام ناقصة: ' || array_to_string(v_incomplete, ', ') end);

  insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('work_orders', p_wo_id::text, 'UPDATE', v_user.id,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status,
                             'forced_with_incomplete', coalesce(to_jsonb(v_incomplete), '[]'::jsonb)));

  return jsonb_build_object('changed', true, 'needs_confirm', false,
                            'incomplete', coalesce(to_jsonb(v_incomplete), '[]'::jsonb));
end $$;

-- ملاحظة: Supabase بيدي execute على دوال public لـ authenticated تلقائي، فمفيش grant هنا.

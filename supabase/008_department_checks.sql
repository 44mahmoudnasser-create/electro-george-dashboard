-- ============================================================
-- 008 — حالة كل قسم على أمر الشغل (CHECK من الأقسام)
-- • 4 أقسام: الصاج، الدهان، التجميع الكهربي، التجميع الميكانيكي
-- • القسم يعدّل حالته هو بس، والمدير/الأدمن يعدّلوا أي قسم
-- • الحالة العامة للأمر (work_orders.status) المدير بس، ومعاها تنبيه لو فيه أقسام مش مكتملة
-- Safe to re-run.
-- ============================================================

create table if not exists public.wo_department_status (
  wo_id       bigint not null references public.work_orders(id) on delete cascade,
  department  text   not null check (department in ('SHEET','PAINT','ELEC_ASSEMBLY','MECH_ASSEMBLY')),
  status      text   not null default 'لم يبدأ'
              check (status in ('لم يبدأ','جاري','متوقف','مكتمل')),
  applicable  boolean not null default true,      -- الأمر ده محتاج القسم ده ولا لأ
  updated_by  uuid references public.app_users(id),
  updated_at  timestamptz not null default now(),
  primary key (wo_id, department)
);

-- ───────────── كل أمر جديد بياخد الأربعة أقسام تلقائي ─────────────
create or replace function public.seed_wo_departments() returns trigger
language plpgsql as $$
begin
  insert into public.wo_department_status (wo_id, department)
  values (new.id,'SHEET'),(new.id,'PAINT'),(new.id,'ELEC_ASSEMBLY'),(new.id,'MECH_ASSEMBLY')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_seed_wo_departments on public.work_orders;
create trigger trg_seed_wo_departments
  after insert on public.work_orders
  for each row execute function public.seed_wo_departments();

-- الأوامر القديمة
insert into public.wo_department_status (wo_id, department)
select w.id, d.dept from public.work_orders w
cross join (values ('SHEET'),('PAINT'),('ELEC_ASSEMBLY'),('MECH_ASSEMBLY')) as d(dept)
on conflict do nothing;

-- ───────────── helper: المستخدم الحالي ─────────────
create or replace function public.current_app_user()
returns public.app_users language sql stable as $$
  select * from public.app_users where id = auth.uid()
$$;

-- ───────────── تحديث حالة قسم ─────────────
create or replace function public.set_department_status(p_wo_id bigint, p_dept text, p_status text)
returns jsonb language plpgsql as $$
declare
  v_user  public.app_users;
  v_row   public.wo_department_status;
begin
  v_user := public.current_app_user();
  if v_user.id is null then raise exception 'لازم تكون مسجل دخول'; end if;

  if v_user.role not in ('admin','manager') and coalesce(v_user.department,'') <> p_dept then
    raise exception 'مش مسموحلك تعدّل حالة قسم تاني';
  end if;

  select * into v_row from public.wo_department_status
   where wo_id = p_wo_id and department = p_dept for update;
  if not found then raise exception 'القسم ده مش مطلوب على الأمر ده'; end if;
  if not v_row.applicable then raise exception 'القسم ده مستبعد من الأمر ده'; end if;

  update public.wo_department_status
     set status = p_status, updated_by = v_user.id, updated_at = now()
   where wo_id = p_wo_id and department = p_dept;

  insert into public.activity_log (table_name, record_id, action, changed_by, department, old_data, new_data)
  values ('wo_department_status', p_wo_id::text || ':' || p_dept, 'UPDATE', v_user.id, p_dept,
          jsonb_build_object('status', v_row.status),
          jsonb_build_object('status', p_status));

  return jsonb_build_object('department', p_dept, 'status', p_status);
end $$;

-- ───────────── تغيير الحالة العامة للأمر (المدير بس) ─────────────
-- لو الحالة الجديدة "مكتمل" والأقسام المطلوبة مش كلها مكتملة:
--   • من غير p_force: مايتغيّرش، ويرجع قائمة الأقسام الناقصة عشان الواجهة تأكد
--   • مع p_force = true: يتغيّر ويتسجل في سجل النشاط إن الأقسام كانت ناقصة
create or replace function public.set_work_order_status(
  p_wo_id bigint, p_status text, p_force boolean default false)
returns jsonb language plpgsql as $$
declare
  v_user       public.app_users;
  v_old        text;
  v_incomplete text[];
begin
  v_user := public.current_app_user();
  if v_user.role not in ('admin','manager') then
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

  insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('work_orders', p_wo_id::text, 'UPDATE', v_user.id,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status,
                             'forced_with_incomplete', coalesce(to_jsonb(v_incomplete), '[]'::jsonb)));

  return jsonb_build_object('changed', true, 'needs_confirm', false,
                            'incomplete', coalesce(to_jsonb(v_incomplete), '[]'::jsonb));
end $$;

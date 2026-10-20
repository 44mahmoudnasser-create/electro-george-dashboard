-- ============================================================
-- 011 — إلغاء فكرة "مطلوب / مش مطلوب" للأقسام
-- كل الأقسام المفعّلة مطلوبة على كل أمر شغل. العمود اتشال والدوال اتعدلت.
-- Safe to re-run.
-- ============================================================

create or replace function public.set_department_status(p_wo_id bigint, p_dept text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user   public.app_users;
  v_mycode text;
  v_old    text;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null then raise exception 'لازم تكون مسجل دخول'; end if;
  v_mycode := public.resolve_department(v_user.department);

  -- الفني/السكرتير بيعدّل قسمه هو بس. الأدمن والمدير بيعدّلوا أي قسم
  if v_user.role not in ('admin','manager') and v_mycode is distinct from p_dept then
    raise exception 'مش مسموحلك تعدّل حالة قسم تاني';
  end if;

  select status into v_old from public.wo_department_status
   where wo_id = p_wo_id and department = p_dept for update;
  if not found then raise exception 'القسم ده مش مربوط بالأمر ده'; end if;

  update public.wo_department_status
     set status = p_status, updated_by = v_user.id, updated_at = now()
   where wo_id = p_wo_id and department = p_dept;

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by)
  values (p_wo_id, 'department', p_dept, v_old, p_status, v_user.id);

  insert into public.activity_log (table_name, record_id, action, changed_by, department, old_data, new_data)
  values ('wo_department_status', p_wo_id::text || ':' || p_dept, 'UPDATE', v_user.id, p_dept,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status));

  return jsonb_build_object('department', p_dept, 'status', p_status);
end $$;

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
     where wo_id = p_wo_id and status <> 'مكتمل';

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

alter table public.wo_department_status drop column if exists applicable;

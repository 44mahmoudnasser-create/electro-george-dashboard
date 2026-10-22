-- ============================================================
-- 021 — إصلاح دالة إنشاء الأمر من مكتب التصميم (كانت موجودة بنسختين)
-- بيشيل كل النسخ القديمة من create_work_order_design، ويعمل النسخة الصح
-- (بدون Total BOM عند الإنشاء، ومعاها اسم العميل والمشروع).
-- Safe to re-run.
-- ============================================================

drop function if exists public.create_work_order_design(text, text, date, text, text, jsonb);
drop function if exists public.create_work_order_design(text, text, date, text, text, jsonb, text, text);
drop function if exists public.create_work_order_design(text, text, date, text, text, text, text);

create or replace function public.create_work_order_design(
  p_wo_number text, p_description text, p_expected_delivery date,
  p_plan_month text, p_priority text, p_client_name text, p_project_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_id   bigint;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or public.resolve_department(v_user.department) is distinct from 'DESIGN' then
    raise exception 'إنشاء الأمر من مكتب التصميم بس';
  end if;

  perform set_config('eg.wo_create', 'on', true);
  insert into public.work_orders (wo_number, description, expected_delivery, plan_month, priority,
                                  client_name, project_name, status, created_date)
  values (p_wo_number, nullif(p_description, ''), p_expected_delivery, nullif(p_plan_month, ''),
          coalesce(nullif(p_priority, ''), 'متوسطة'), nullif(p_client_name, ''), nullif(p_project_name, ''),
          'لم يبدأ', current_date)
  returning id into v_id;
  perform set_config('eg.wo_create', 'off', true);

  insert into public.wo_status_history (wo_id, scope, department, from_status, to_status, changed_by, note)
  values (v_id, 'work_order', 'DESIGN', null, 'لم يبدأ', v_user.id, 'إنشاء الأمر');

  return jsonb_build_object('id', v_id);
end $$;

notify pgrst, 'reload schema';

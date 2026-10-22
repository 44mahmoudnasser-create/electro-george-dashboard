-- ============================================================
-- 018 — اسم العميل واسم المشروع على الأمر + Total BOM بعد الإنشاء بصفحته
-- • الأمر ممكن يتعمل من غير Total BOM، والـ Total BOM يتكتب بعدين مرة واحدة (set_total_bom) وبعدها بيتقفل
-- • إزالة رقم الصنف من البنود (البند بيترقم تلقائي #)
-- Safe to re-run.
-- ============================================================

alter table public.work_orders add column if not exists client_name  text;
alter table public.work_orders add column if not exists project_name text;

-- رقم الصنف اتشال من البنود (العمود بيفضل في الداتابيز من غير استخدام، عشان ماتضيعش بيانات)

-- ───────────── إنشاء أمر من مكتب التصميم (بدون Total BOM) ─────────────
drop function if exists public.create_work_order_design(text, text, date, text, text, jsonb);

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

-- ───────────── كتابة Total BOM مرة واحدة (بعد الإنشاء) ─────────────
create or replace function public.set_total_bom(p_wo_id bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.app_users;
  v_count int;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or (v_user.role <> 'manager'
     and public.resolve_department(v_user.department) is distinct from 'DESIGN') then
    raise exception 'كتابة Total BOM لمكتب التصميم والمدير بس';
  end if;
  if not exists (select 1 from public.work_orders where id = p_wo_id) then
    raise exception 'أمر الشغل غير موجود';
  end if;
  if exists (select 1 from public.wo_total_bom where wo_id = p_wo_id) then
    raise exception 'Total BOM اتكتب قبل كده ومقفول';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'لازم يكون فيه سطر واحد على الأقل';
  end if;

  perform set_config('eg.total_bom_create', 'on', true);
  insert into public.wo_total_bom (wo_id, s_no, qty, unit, description, part_no, remark, created_by)
  select p_wo_id,
         nullif(e->>'s_no', '')::int,
         coalesce(nullif(e->>'qty', '')::numeric, 1),
         nullif(e->>'unit', ''),
         e->>'description',
         nullif(e->>'part_no', ''),
         nullif(e->>'remark', ''),
         v_user.id
  from jsonb_array_elements(p_rows) e;
  get diagnostics v_count = row_count;
  perform set_config('eg.total_bom_create', 'off', true);

  insert into public.activity_log (table_name, record_id, action, changed_by, new_data)
  values ('wo_total_bom', p_wo_id::text, 'INSERT', v_user.id,
          jsonb_build_object('rows', v_count));

  return jsonb_build_object('rows', v_count);
end $$;

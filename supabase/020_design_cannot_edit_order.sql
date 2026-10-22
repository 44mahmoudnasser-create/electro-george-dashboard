-- ============================================================
-- 020 — مكتب التصميم يسجل بيانات الأمر عند الإنشاء بس، وبعدها مايقدرش يعدّلها
-- (الحالة، الأولوية، التسليم، شهر الخطة، العميل، المشروع، الوصف)
-- الفحص بقى بالقسم (DESIGN) مش بالدور، فحتى لو المستخدم دوره manager برضه مايعدلش.
-- Safe to re-run.
-- ============================================================

create or replace function public.guard_work_orders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;      -- SQL Editor / صيانة

  -- مكتب التصميم: إنشاء الأمر بس (من الدالة)، ومايعدلش أي حاجة بعد كده
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

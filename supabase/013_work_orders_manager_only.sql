-- ============================================================
-- 013 — الأوامر: المدير بس يضيف ويعدّل أمر الشغل
-- • الحماية في الداتابيز (trigger) مش في الواجهة بس
-- • لو مفيش مستخدم مسجل دخول (SQL Editor / سكربتات) مايتحجبش
-- Safe to re-run.
-- ============================================================

create or replace function public.guard_work_orders_manager_only()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return coalesce(new, old);           -- SQL Editor / سكربتات الصيانة
  end if;
  select role into v_role from public.app_users where id = auth.uid();
  if v_role is distinct from 'manager' then
    raise exception 'إضافة وتعديل أوامر الشغل للمدير بس';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_work_orders_ins on public.work_orders;
create trigger trg_guard_work_orders_ins
  before insert on public.work_orders
  for each row execute function public.guard_work_orders_manager_only();

drop trigger if exists trg_guard_work_orders_upd on public.work_orders;
create trigger trg_guard_work_orders_upd
  before update on public.work_orders
  for each row execute function public.guard_work_orders_manager_only();

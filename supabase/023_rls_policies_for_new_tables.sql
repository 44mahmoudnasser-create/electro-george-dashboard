-- ============================================================
-- 023 — سياسات RLS للجداول الجديدة (الـ RLS مفعّل عليها وماكانش ليها سياسات)
-- السبب: أي قراءة/كتابة من المستخدم العادي على الجداول دي كانت بتترفض بصمت
--        (ومنها جدول الأقسام، فالواجهة كانت مش شايفة إن المستخدم من مكتب التصميم).
-- الحماية الإضافية (triggers + الدوال) لسه شغالة فوق السياسات دي.
-- ⚠ للمراجعة قبل التنفيذ على الإنتاج.
-- Safe to re-run.
-- ============================================================

create or replace function public.is_manager_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users u where u.id = auth.uid() and u.role = 'manager')
$$;

-- seed الأقسام لكل أمر جديد: لازم يشتغل بصلاحية المالك عشان RLS ما يحجبهوش
alter function public.seed_wo_departments() security definer set search_path = public;

-- ───── الأقسام ─────
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (true);
drop policy if exists departments_manage on public.departments;
create policy departments_manage on public.departments for all to authenticated
  using (public.is_manager_user()) with check (public.is_manager_user());

-- ───── بنود الأمر ─────
drop policy if exists work_order_items_read on public.work_order_items;
create policy work_order_items_read on public.work_order_items for select to authenticated using (true);
drop policy if exists work_order_items_write on public.work_order_items;
create policy work_order_items_write on public.work_order_items for all to authenticated
  using (public.is_manager_user() or public.is_design_user())
  with check (public.is_manager_user() or public.is_design_user());

-- ───── Total BOM (الـ trigger بيقفله بعد الكتابة) ─────
drop policy if exists wo_total_bom_read on public.wo_total_bom;
create policy wo_total_bom_read on public.wo_total_bom for select to authenticated using (true);
drop policy if exists wo_total_bom_write on public.wo_total_bom;
create policy wo_total_bom_write on public.wo_total_bom for all to authenticated
  using (public.is_manager_user() or public.is_design_user())
  with check (public.is_manager_user() or public.is_design_user());

-- ───── حالة الأقسام على الأمر ─────
drop policy if exists wo_dept_status_read on public.wo_department_status;
create policy wo_dept_status_read on public.wo_department_status for select to authenticated using (true);
drop policy if exists wo_dept_status_update on public.wo_department_status;
create policy wo_dept_status_update on public.wo_department_status for update to authenticated
  using (public.is_manager_user() or department = public.current_dept_code())
  with check (public.is_manager_user() or department = public.current_dept_code());
drop policy if exists wo_dept_status_insert on public.wo_department_status;
create policy wo_dept_status_insert on public.wo_department_status for insert to authenticated
  with check (public.is_manager_user());

-- ───── سجل الحالات (للحسابات بعدين) ─────
drop policy if exists wo_status_history_read on public.wo_status_history;
create policy wo_status_history_read on public.wo_status_history for select to authenticated using (true);
drop policy if exists wo_status_history_insert on public.wo_status_history;
create policy wo_status_history_insert on public.wo_status_history for insert to authenticated with check (true);

-- ───── إذون الصرف (الكتابة بتتم بالدالة) ─────
drop policy if exists dispense_notes_read on public.dispense_notes;
create policy dispense_notes_read on public.dispense_notes for select to authenticated using (true);

-- ───── أرشيف الدمج: المدير بس ─────
drop policy if exists wo_merge_archive_manager on public.wo_merge_archive;
create policy wo_merge_archive_manager on public.wo_merge_archive for all to authenticated
  using (public.is_manager_user()) with check (public.is_manager_user());

-- ───── قائمة الإنتاج: مكتب التصميم يضيف بعد اعتماد البند (الـ trigger بيتحقق) ─────
drop policy if exists wo_production_items_design_insert on public.wo_production_items;
create policy wo_production_items_design_insert on public.wo_production_items for insert to authenticated
  with check (public.is_manager_user() or public.is_design_user());

-- ───── BOM البنود: مكتب التصميم يضيف بعد اعتماد البند (الـ trigger بيتحقق) ─────
drop policy if exists wo_bom_items_design_insert on public.wo_bom_items;
create policy wo_bom_items_design_insert on public.wo_bom_items for insert to authenticated
  with check (public.is_manager_user() or public.is_design_user());

notify pgrst, 'reload schema';

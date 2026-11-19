-- ============================================================
-- 032 — الفنيين: السكرتير يشوف ويعدّل ويحذف فنيين قسمه بس
-- Removes technicians_secretary_all (ALL rows for any secretary, every department)
-- and replaces it with department-scoped delete for secretaries.
-- Read / insert / update for own department already exist
-- (dept_select_technicians, dept_insert_technicians, dept_update_technicians).
-- Safe to re-run.
-- ============================================================

drop policy if exists technicians_secretary_all on public.technicians;

drop policy if exists technicians_secretary_dept_delete on public.technicians;
create policy technicians_secretary_dept_delete on public.technicians
  for delete to authenticated
  using (current_user_role() = 'secretary' and department = my_department());

-- ============================================================
-- 030 — Row Level Security policies for public.paint_types
-- Problem: RLS is enabled on paint_types but no policies exist, so every
-- insert/update/select is denied ("new row violates row-level security policy").
-- Rules:
--   * any signed-in user can read the paint types (needed by the paint page
--     and by set_paint_type, which is SECURITY INVOKER)
--   * only managers can add / rename / deactivate paint types
-- The UI only shows the "أنواع الدهان" management controls to managers
-- (canManageTypes in app/monitoring/paint).
-- Safe to re-run.
-- ============================================================

drop policy if exists paint_types_read on public.paint_types;
create policy paint_types_read on public.paint_types
  for select to authenticated
  using (true);

drop policy if exists paint_types_manager_write on public.paint_types;
create policy paint_types_manager_write on public.paint_types
  for all to authenticated
  using (current_user_role() = 'manager')
  with check (current_user_role() = 'manager');

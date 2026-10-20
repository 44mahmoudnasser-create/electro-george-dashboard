-- ============================================================
-- 007 — وصف لكل أمر شغل
-- Safe to re-run.
-- ============================================================
alter table public.work_orders add column if not exists description text;

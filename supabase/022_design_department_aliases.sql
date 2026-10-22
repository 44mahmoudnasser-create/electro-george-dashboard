-- ============================================================
-- 022 — أسماء قسم مكتب التصميم اللي ممكن تكون متخزنة في app_users
-- (بيضيف أي صيغة ناقصة للـ aliases، من غير ما يغيّر أي بيانات تانية)
-- Safe to re-run.
-- ============================================================

update public.departments
   set aliases = (
     select array_agg(distinct x) from unnest(
       coalesce(aliases, '{}') || array[
         'DESIGN', 'design', 'DESIGN OFFICE', 'DESIGN OFFCE', 'design office', 'design offce',
         'مكتب التصميم', 'التصميم'
       ]) as x
   )
 where code = 'DESIGN';

-- تشيك: القيم الموجودة فعلاً عند المستخدمين اللي دورهم مش واضح
-- select email, role, department from public.app_users
--  where department ilike '%design%' or department ilike '%offc%' or department like '%تصميم%';

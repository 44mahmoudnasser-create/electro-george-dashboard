-- ============================================================
-- 023 — نتأكد إن قسم مكتب التصميم موجود ومفعّل في جدول الأقسام
-- (لو الصف مش موجود، بيتضاف. لو موجود، بيتفعّل وبيتحدّث الـ aliases)
-- Safe to re-run.
-- ============================================================

insert into public.departments (code, name_ar, aliases, sort_no, active, in_wo_checks)
values ('DESIGN', 'مكتب التصميم',
        array['DESIGN','design','DESIGN OFFICE','design office','DESIGN OFFCE','design offce','مكتب التصميم'],
        10, true, false)
on conflict (code) do update
  set active = true,
      in_wo_checks = false,
      aliases = (select array_agg(distinct x) from unnest(
                   coalesce(public.departments.aliases, '{}') ||
                   array['DESIGN','design','DESIGN OFFICE','design office','DESIGN OFFCE','design offce','مكتب التصميم']) as x);

-- تشيك: لازم يرجّع DESIGN
select public.resolve_department('design office') as resolved_code;

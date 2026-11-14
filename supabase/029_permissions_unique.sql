-- ============================================================
-- 029 — قيد unique (tech_id, date) لجداول الحضور والإذونات والعمل الإضافي
-- السبب: صفحة الحضور بتحفظ بـ upsert على (tech_id, date)، وجدول permissions
--        في الداتابيز كان من غير القيد ده، فالحفظ كان بيقع بالخطأ:
--        "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- • بيمسح التكرار الأول (بيسيب أحدث صف لكل فني في اليوم) وبعدين يضيف القيد
-- Safe to re-run.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['permissions', 'attendance', 'overtime'] loop
    -- لو فيه قيد unique على (tech_id, date) بالفعل، مفيش حاجة تتعمل
    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = ('public.' || t)::regclass
        and c.contype in ('u', 'p')
        and (select array_agg(a.attname::text order by a.attname)
             from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
            = array['date', 'tech_id']
    ) and not exists (
      select 1
      from pg_index i
      where i.indrelid = ('public.' || t)::regclass
        and i.indisunique and i.indpred is null
        and (select array_agg(a.attname::text order by a.attname)
             from unnest(i.indkey) k join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k)
            = array['date', 'tech_id']
    ) then
      execute format(
        'delete from public.%I x using public.%I y
         where x.tech_id = y.tech_id and x.date = y.date and x.id < y.id', t, t);
      execute format(
        'alter table public.%I add constraint %I unique (tech_id, date)', t, t || '_tech_id_date_key');
    end if;
  end loop;
end $$;

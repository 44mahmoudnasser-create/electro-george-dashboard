-- ============================================================
-- 019 — دمج أوامر الشغل القديمة كبنود داخل الأمر الأساسي
--
-- القاعدة: أي أوامر رقمها نفس الرقم الأساسي (مثلاً 1954 و 1954 T1 و 1954 T2)
--          بتتدمج تحت أمر واحد رقمه = الرقم الأساسي، وكل أمر قديم بيبقى بند.
--          الأوامر اللي رقمها مالوش جزء تاني (زي 2222) مابتتغيرش.
--
-- ⚠ اعمل الخطوة 1 (المعاينة) الأول وراجع النتيجة.
-- ⚠ الخطوة 2 بتتنفذ في transaction واحدة: لو حصل أي خطأ مفيش حاجة بتتغير.
-- ⚠ كل أمر قديم بيتحفظ كاملاً في wo_merge_archive قبل أي حذف.
-- ============================================================

-- ─────────── 1) المعاينة (شغّل ده الأول) ───────────
with parsed as (
  select id, wo_number,
         (regexp_match(btrim(wo_number), '^(\d+)(.*)$'))[1] as base,
         btrim((regexp_match(btrim(wo_number), '^(\d+)(.*)$'))[2]) as suffix
  from public.work_orders
  where btrim(wo_number) ~ '^\d+'
), groups as (
  select base, count(*) as n, min(id) as parent_id
  from parsed group by base having count(*) >= 2
)
select g.base as "الأمر الأساسي", g.n as "عدد الأوامر",
       (select wo_number from public.work_orders where id = g.parent_id) as "الأمر اللي هيبقى أساسي دلوقتي",
       (select string_agg(p.wo_number, ' | ' order by p.id) from parsed p where p.base = g.base) as "كل الأوامر في المجموعة"
from groups g
order by g.base::int;

-- ─────────── 2) التنفيذ (بعد ما تراجع المعاينة) ───────────
do $$
declare
  v_groups  int;
  v_items   int;
  v_bom     int;
begin
  drop table if exists merge_map;
  create temp table merge_map as
  with parsed as (
    select id, wo_number,
           (regexp_match(btrim(wo_number), '^(\d+)(.*)$'))[1] as base,
           btrim((regexp_match(btrim(wo_number), '^(\d+)(.*)$'))[2]) as suffix,
           status
    from public.work_orders
    where btrim(wo_number) ~ '^\d+'
  ), groups as (
    select base, min(id) as parent_id from parsed group by base having count(*) >= 2
  )
  select x.id as child_id, g.parent_id, g.base,
         x.wo_number as wo_number_orig, x.status as status_orig,
         coalesce(nullif(x.suffix, ''), x.wo_number) as label,
         row_number() over (partition by g.base order by x.id) as ord
  from groups g join parsed x on x.base = g.base;

  select count(distinct base) into v_groups from merge_map;
  if v_groups = 0 then
    raise notice 'مفيش أوامر تتدمج';
    return;
  end if;

  -- أمان: كل أمر قديم لازم يكون عنده بند واحد بالظبط (الدمج بيفترض كده)
  if exists (select 1 from merge_map m
              where (select count(*) from public.work_order_items i where i.wo_id = m.child_id) > 1) then
    raise exception 'فيه أمر عنده أكتر من بند قبل الدمج، راجعه يدوي قبل ما نكمل';
  end if;

  -- أمان: الـ Total BOM مايتدمجش لو أكتر من أمر ليه Total BOM في نفس المجموعة
  select count(distinct t.wo_id) into v_bom
  from public.wo_total_bom t
  where t.wo_id in (select child_id from merge_map);
  if v_bom > 1 then
    raise exception 'فيه أكتر من أمر ليه Total BOM في نفس المجموعة، راجعهم يدوي';
  end if;

  -- 2.1 أرشيف كامل للأوامر اللي هتتشال
  create table if not exists public.wo_merge_archive (
    id           bigint generated always as identity primary key,
    merged_at    timestamptz not null default now(),
    child_wo_id  bigint not null,
    parent_wo_id bigint not null,
    wo_row       jsonb not null,
    dept_status  jsonb not null default '[]'::jsonb,
    total_bom    jsonb not null default '[]'::jsonb
  );
  insert into public.wo_merge_archive (child_wo_id, parent_wo_id, wo_row, dept_status, total_bom)
  select m.child_id, m.parent_id, to_jsonb(w),
         coalesce((select jsonb_agg(to_jsonb(d)) from public.wo_department_status d where d.wo_id = m.child_id), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(t)) from public.wo_total_bom t where t.wo_id = m.child_id), '[]'::jsonb)
  from merge_map m join public.work_orders w on w.id = m.child_id
  where m.child_id <> m.parent_id;

  -- 2.2 أعمدة الأثر على البنود
  alter table public.work_order_items add column if not exists legacy_wo_id     bigint;
  alter table public.work_order_items add column if not exists legacy_wo_number text;
  alter table public.work_order_items add column if not exists legacy_status    text;

  -- 2.3 أسماء مؤقتة عشان مايحصلش تعارض في wo_number
  update public.work_orders set wo_number = 'MERGE-' || id
   where id in (select child_id from merge_map);

  -- 2.4 الأمر اللي مالوش بند ياخد بند من بياناته
  insert into public.work_order_items (wo_id, item_no, description, qty, status, approved_at, legacy_wo_id, legacy_wo_number, legacy_status)
  select m.child_id, -m.child_id, m.label, 1, 'approved', now(), m.child_id, m.wo_number_orig, m.status_orig
  from merge_map m
  where not exists (select 1 from public.work_order_items i where i.wo_id = m.child_id);

  -- 2.5 نقل البنود للأمر الأساسي + تسجيل الأثر
  update public.work_order_items i
     set legacy_wo_id = i.wo_id,
         legacy_wo_number = m.wo_number_orig,
         legacy_status = m.status_orig,
         description = m.label,
         wo_id = m.parent_id,
         item_no = -i.id
    from merge_map m
   where i.wo_id = m.child_id;

  -- ترقيم البنود داخل كل أمر أساسي حسب ترتيب الأوامر الأصلية
  update public.work_order_items i
     set item_no = r.rn
    from (
      select i2.id, row_number() over (partition by m2.parent_id order by m2.ord) as rn
      from public.work_order_items i2
      join merge_map m2 on i2.legacy_wo_id = m2.child_id
    ) r
   where i.id = r.id;

  -- 2.6 نقل كل الجداول المرتبطة بالأمر القديم للأمر الأساسي
  update public.wo_bom_items b set work_order_id = m.parent_id
    from merge_map m where b.work_order_id = m.child_id and m.child_id <> m.parent_id;
  update public.wo_production_items p set work_order_id = m.parent_id
    from merge_map m where p.work_order_id = m.child_id and m.child_id <> m.parent_id;
  update public.files f set wo_id = m.parent_id
    from merge_map m where f.wo_id = m.child_id and m.child_id <> m.parent_id;
  update public.purchases x set wo_id = m.parent_id
    from merge_map m where x.wo_id = m.child_id and m.child_id <> m.parent_id;
  update public.purchase_orders x set wo_id = m.parent_id
    from merge_map m where x.wo_id = m.child_id and m.child_id <> m.parent_id;
  update public.daily_productivity x set wo_id = m.parent_id
    from merge_map m where x.wo_id = m.child_id and m.child_id <> m.parent_id;
  update public.wo_status_history x set wo_id = m.parent_id
    from merge_map m where x.wo_id = m.child_id and m.child_id <> m.parent_id;
  update public.dispense_notes x set wo_id = m.parent_id
    from merge_map m where x.wo_id = m.child_id and m.child_id <> m.parent_id;
  update public.wo_total_bom x set wo_id = m.parent_id
    from merge_map m where x.wo_id = m.child_id and m.child_id <> m.parent_id;

  -- حالات الأقسام بتتشال للأوامر القديمة (الأرشيف فيه نسختها)
  delete from public.wo_department_status d
   using merge_map m where d.wo_id = m.child_id and m.child_id <> m.parent_id;

  -- 2.7 شيل الأوامر القديمة
  delete from public.work_orders w
   using merge_map m where w.id = m.child_id and m.child_id <> m.parent_id;

  -- 2.8 الأمر الأساسي ياخد رقمه الأصلي
  update public.work_orders w set wo_number = m.base
    from merge_map m where w.id = m.parent_id;

  select count(*) into v_items from public.work_order_items where legacy_wo_id in (select child_id from merge_map);

  insert into public.activity_log (table_name, record_id, action, changed_by, new_data)
  values ('work_orders', 'merge', 'UPDATE', null,
          jsonb_build_object('merged_groups', v_groups, 'items_created_or_moved', v_items));

  raise notice 'تم دمج % مجموعة، و % بند', v_groups, v_items;
end $$;

-- ============================================================
-- 004 — متابعة قسم الدهان
-- • أنواع الدهان (جدول قابل للإضافة من الواجهة)
-- • نوع الدهان على كل بند
-- • تسجيل الدهان بيتحقق من المتاح (المستلم من الصاج − المدهون) داخل الداتابيز
-- • بند نوع دهانه اتسجل عليه دهان ماينفعش يتغير نوعه
-- Safe to re-run.
-- ============================================================

create table if not exists public.paint_types (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.wo_production_items
  add column if not exists paint_type_id bigint references public.paint_types(id);

-- ───────────── تحديد نوع الدهان لبند أو أكتر ─────────────
create or replace function public.set_paint_type(p_item_ids bigint[], p_paint_type_id bigint)
returns jsonb
language plpgsql as $$
declare
  v_item    public.wo_production_items;
  v_updated bigint[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
begin
  if p_paint_type_id is not null and not exists (
       select 1 from public.paint_types where id = p_paint_type_id and active) then
    raise exception 'نوع الدهان غير موجود أو متعطل';
  end if;

  for v_item in
    select * from public.wo_production_items where id = any(p_item_ids) order by id for update
  loop
    if v_item.qty_paint > 0 then
      v_skipped := v_skipped || jsonb_build_object('id', v_item.id, 'description', v_item.description);
      continue;
    end if;
    update public.wo_production_items set paint_type_id = p_paint_type_id where id = v_item.id;
    v_updated := v_updated || v_item.id;
  end loop;

  return jsonb_build_object('updated', to_jsonb(v_updated), 'skipped', v_skipped);
end $$;

-- ───────────── تسجيل دهان ─────────────
create or replace function public.log_paint(
  p_item_id bigint, p_qty numeric, p_note text default null)
returns jsonb
language plpgsql as $$
declare
  v_item  public.wo_production_items;
  v_avail numeric;
begin
  select * into v_item from public.wo_production_items where id = p_item_id for update;
  if not found then raise exception 'البند غير موجود'; end if;
  if v_item.required_painting = 'NA' then raise exception 'البند ده مش محتاج دهان'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'أدخل كمية صحيحة'; end if;

  v_avail := greatest(coalesce(v_item.qty_sheet, 0) - coalesce(v_item.qty_paint, 0), 0);
  if p_qty > v_avail then
    raise exception 'الكمية (%) أكبر من المتاح للدهان (%)', p_qty, v_avail;
  end if;

  -- log_production (الموجودة) بتسجل الحركة وبتزود qty_paint
  perform public.log_production(
    p_item_id => p_item_id, p_stage => 'paint', p_qty => p_qty,
    p_machine_id => null, p_note => p_note);

  return jsonb_build_object(
    'qty_paint', (select qty_paint from public.wo_production_items where id = p_item_id),
    'available', greatest((select qty_sheet - qty_paint from public.wo_production_items where id = p_item_id), 0));
end $$;

-- ───────────── Realtime ─────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'wo_production_items') then
    alter publication supabase_realtime add table public.wo_production_items;
  end if;
end $$;

-- ============================================================
-- 003 — مسار تصنيع الصاج (بنش ← مقص ← تني ← لحام)
-- • كل بند ليه مسار (sheet_route) بالمراحل اللي هيعدي عليها، بالترتيب الثابت
-- • المراحل متسلسلة: كل مرحلة متاحلها اللي خلص من المرحلة اللي قبلها في المسار
-- • إجمالي الصاج (qty_sheet) بيزيد تلقائي لما آخر مرحلة في المسار تخلص،
--   عن طريق log_production الموجودة — فالدهان بيتفتح بنفس المنطق الحالي
-- • بند من غير مسار ('{}') بيتسجل يدوي زي الأول
-- Safe to re-run.
-- ============================================================

-- 1) المسار على كل بند
alter table public.wo_production_items
  add column if not exists sheet_route text[] not null default '{}';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wo_production_items_sheet_route_chk') then
    alter table public.wo_production_items add constraint wo_production_items_sheet_route_chk
      check (sheet_route <@ array['punch','cut','bend','weld']::text[]);
  end if;
end $$;

-- 2) ربط المكنة بمرحلة (null = تظهر في كل المراحل)
alter table public.machines
  add column if not exists stage text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'machines_stage_chk') then
    alter table public.machines add constraint machines_stage_chk
      check (stage is null or stage in ('punch','cut','bend','weld'));
  end if;
end $$;

-- 3) سجل كل حركة على المراحل الفرعية (مين / إمتى / أنهي مكنة)
create table if not exists public.wo_substage_log (
  id                 bigint generated always as identity primary key,
  production_item_id bigint not null references public.wo_production_items(id) on delete cascade,
  stage              text not null check (stage in ('punch','cut','bend','weld')),
  qty                numeric not null check (qty > 0),
  machine_id         bigint references public.machines(id),
  logged_by          uuid references public.app_users(id) default auth.uid(),
  note               text,
  created_at         timestamptz not null default now()
);
create index if not exists wo_substage_log_item_idx on public.wo_substage_log (production_item_id);
create index if not exists wo_item_substages_item_stage_idx on public.wo_item_substages (production_item_id, stage);

-- helper: ترتيب المراحل الثابت
create or replace function public.sheet_stage_label(p_stage text) returns text
language sql immutable as $$
  select case p_stage when 'punch' then 'البنش' when 'cut' then 'المقص'
                      when 'bend' then 'التني' when 'weld' then 'اللحام' else p_stage end
$$;

-- ============================================================
-- 4) تحديد المسار لبند أو أكتر
--    البند اللي اتسجل عليه في المراحل بالفعل بيتساب زي ما هو ويترجع في skipped
-- ============================================================
create or replace function public.set_sheet_route(p_item_ids bigint[], p_route text[])
returns jsonb
language plpgsql as $$
declare
  v_order  constant text[] := array['punch','cut','bend','weld'];
  v_route  text[];
  v_item   public.wo_production_items;
  v_stage  text;
  v_prev   numeric;
  v_done   numeric;
  v_updated bigint[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
begin
  if not (coalesce(p_route, '{}') <@ v_order) then
    raise exception 'مرحلة غير معروفة في المسار';
  end if;

  -- ترتيب ثابت ومن غير تكرار مهما كان ترتيب الإدخال
  select coalesce(array_agg(s order by array_position(v_order, s)), '{}')
    into v_route
    from (select distinct unnest(coalesce(p_route, '{}')) as s) x;

  for v_item in
    select * from public.wo_production_items where id = any(p_item_ids) order by id for update
  loop
    if exists (select 1 from public.wo_substage_log where production_item_id = v_item.id) then
      v_skipped := v_skipped || jsonb_build_object('id', v_item.id, 'description', v_item.description);
      continue;
    end if;

    update public.wo_production_items set sheet_route = v_route where id = v_item.id;

    -- ضبط العدادات: اللي اتسجل صاج يدوي قبل كده يتحسب إنه عدّى على كل المراحل،
    -- وكل مرحلة متزدش عن اللي قبلها (تسلسل سليم)
    v_prev := v_item.qty;
    foreach v_stage in array v_route loop
      select qty_done into v_done from public.wo_item_substages
       where production_item_id = v_item.id and stage = v_stage;
      v_done := least(greatest(coalesce(v_done, 0), v_item.qty_sheet), v_prev);

      update public.wo_item_substages set qty_done = v_done, updated_at = now()
       where production_item_id = v_item.id and stage = v_stage;
      if not found then
        insert into public.wo_item_substages (production_item_id, stage, qty_done)
        values (v_item.id, v_stage, v_done);
      end if;
      v_prev := v_done;
    end loop;

    v_updated := v_updated || v_item.id;
  end loop;

  return jsonb_build_object('route', to_jsonb(v_route), 'updated', to_jsonb(v_updated), 'skipped', v_skipped);
end $$;

-- ============================================================
-- 5) تسجيل كمية على مرحلة — بيتحقق من المسار والتسلسل والمتاح،
--    ولو دي آخر مرحلة بيزود إجمالي الصاج عن طريق log_production
-- ============================================================
create or replace function public.log_sheet_substage(
  p_item_id bigint, p_stage text, p_qty numeric,
  p_machine_id bigint default null, p_note text default null)
returns jsonb
language plpgsql as $$
declare
  v_item     public.wo_production_items;
  v_idx      int;
  v_prev     numeric;
  v_done     numeric;
  v_avail    numeric;
  v_last     boolean;
  v_delta    numeric := 0;
  v_machine  public.machines;
  v_required boolean;
begin
  select * into v_item from public.wo_production_items where id = p_item_id for update;
  if not found then raise exception 'البند غير موجود'; end if;

  v_idx := array_position(v_item.sheet_route, p_stage);
  if v_idx is null then
    raise exception 'مرحلة % مش في مسار البند ده', public.sheet_stage_label(p_stage);
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'أدخل كمية صحيحة'; end if;

  -- المكنة
  select coalesce((select value not in ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb)
                     from public.app_settings where key = 'machine_required_for_log'), false)
    into v_required;
  if p_machine_id is null and v_required then raise exception 'اختيار المكنة إجباري'; end if;
  if p_machine_id is not null then
    select * into v_machine from public.machines where id = p_machine_id;
    if not found or not v_machine.active then raise exception 'المكنة غير متاحة'; end if;
    if v_machine.stage is not null and v_machine.stage <> p_stage then
      raise exception 'المكنة % مخصصة لمرحلة %', v_machine.name, public.sheet_stage_label(v_machine.stage);
    end if;
  end if;

  -- المتاح = اللي خلص من المرحلة اللي قبلها في المسار − اللي اتعمل هنا
  if v_idx = 1 then
    v_prev := v_item.qty;
  else
    select qty_done into v_prev from public.wo_item_substages
     where production_item_id = p_item_id and stage = v_item.sheet_route[v_idx - 1];
  end if;
  select qty_done into v_done from public.wo_item_substages
   where production_item_id = p_item_id and stage = p_stage;
  v_prev  := coalesce(v_prev, 0);
  v_done  := coalesce(v_done, 0);
  v_avail := greatest(v_prev - v_done, 0);

  if p_qty > v_avail then
    if v_idx > 1 and v_avail = 0 then
      raise exception 'لسه مفيش قطع خلصت من % — مفيش حاجة متاحة لـ %',
        public.sheet_stage_label(v_item.sheet_route[v_idx - 1]), public.sheet_stage_label(p_stage);
    end if;
    raise exception 'الكمية (%) أكبر من المتاح في % (%)', p_qty, public.sheet_stage_label(p_stage), v_avail;
  end if;

  update public.wo_item_substages set qty_done = qty_done + p_qty, updated_at = now()
   where production_item_id = p_item_id and stage = p_stage;
  if not found then
    insert into public.wo_item_substages (production_item_id, stage, qty_done)
    values (p_item_id, p_stage, p_qty);
  end if;

  insert into public.wo_substage_log (production_item_id, stage, qty, machine_id, note)
  values (p_item_id, p_stage, p_qty, p_machine_id, p_note);

  -- آخر مرحلة ← إجمالي الصاج
  v_last := v_idx = array_length(v_item.sheet_route, 1);
  if v_last then
    v_delta := greatest(v_done + p_qty - v_item.qty_sheet, 0);
    if v_delta > 0 then
      perform set_config('eg.via_route', 'on', true);
      perform public.log_production(
        p_item_id => p_item_id, p_stage => 'sheet', p_qty => v_delta,
        p_machine_id => p_machine_id, p_note => p_note);
      perform set_config('eg.via_route', 'off', true);
    end if;
  end if;

  return jsonb_build_object(
    'stage', p_stage,
    'qty_done', v_done + p_qty,
    'qty_sheet', (select qty_sheet from public.wo_production_items where id = p_item_id),
    'sheet_added', v_delta);
end $$;

-- ============================================================
-- 6) حماية: البند اللي ليه مسار، إجمالي الصاج بتاعه مايتغيرش يدوي
--    (مثلًا من صفحة أمر الشغل) — بيتغير بس من log_sheet_substage
-- ============================================================
create or replace function public.guard_routed_sheet_qty() returns trigger
language plpgsql as $$
begin
  if new.qty_sheet is distinct from old.qty_sheet
     and cardinality(old.sheet_route) > 0
     and coalesce(current_setting('eg.via_route', true), '') <> 'on' then
    raise exception 'البند ده ليه مسار تصنيع — الصاج بيتسجل تلقائي من صفحة متابعة الصاج';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_routed_sheet_qty on public.wo_production_items;
create trigger trg_guard_routed_sheet_qty
  before update of qty_sheet on public.wo_production_items
  for each row execute function public.guard_routed_sheet_qty();

-- ============================================================
-- 7) Realtime: التحديث اللحظي لصفحة المتابعة
-- ============================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['wo_production_items', 'wo_item_substages'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

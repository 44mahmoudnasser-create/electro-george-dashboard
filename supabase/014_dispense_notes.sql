-- ============================================================
-- 014 — إذن صرف مواد: صرف أكتر من بند في عملية واحدة + سجل إذون الصرف
-- • الصرف بيتم في transaction واحدة: كله يتصرف أو ولا حاجة
-- • المدير أي بند، والباقي بنود قسمه بس (حسب resolve_department)
-- • كل إذن بيتسجل بالبنود والكميات والمستلم والمهندس عشان يتطبع تاني
-- Safe to re-run.
-- ============================================================

create table if not exists public.dispense_notes (
  id            bigint generated always as identity primary key,
  note_no       text unique,
  wo_id         bigint not null references public.work_orders(id) on delete cascade,
  process_name  text,                       -- اسم العملية
  receiver_name text,                       -- توقيع المستلم (اسم)
  engineer_name text,                       -- المهندس المسؤول
  items         jsonb not null default '[]'::jsonb,   -- snapshot للبنود وقت الصرف
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists dispense_notes_wo_idx on public.dispense_notes (wo_id, created_at);

-- ───────────── صرف مجموعة بنود في إذن واحد ─────────────
-- p_items = [{ "bom_item_id": 1, "qty": 5 }, ...]
create or replace function public.dispense_bom_batch(
  p_wo_id bigint, p_items jsonb,
  p_process text default null, p_receiver text default null, p_engineer text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user     public.app_users;
  v_mycode   text;
  v_entry    jsonb;
  v_item     public.wo_bom_items;
  v_qty      numeric;
  v_snapshot jsonb := '[]'::jsonb;
  v_note_id  bigint;
  v_note_no  text;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null then raise exception 'لازم تكون مسجل دخول'; end if;
  v_mycode := public.resolve_department(v_user.department);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'اختار بند واحد على الأقل';
  end if;
  if not exists (select 1 from public.work_orders where id = p_wo_id) then
    raise exception 'أمر الشغل غير موجود';
  end if;

  -- 1) التحقق أولاً من كل البنود قبل ما أكتب أي حاجة
  for v_entry in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_entry->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'أدخل كمية صحيحة لكل بند'; end if;

    select * into v_item from public.wo_bom_items
     where id = (v_entry->>'bom_item_id')::bigint for update;
    if not found or v_item.work_order_id <> p_wo_id then
      raise exception 'بند غير تابع للأمر ده';
    end if;
    if v_user.role <> 'manager' and public.resolve_department(v_item.department) is distinct from v_mycode then
      raise exception 'البند ده من قسم تاني: %', v_item.description;
    end if;
    if v_item.qty_dispensed + v_qty > v_item.qty then
      raise exception 'الكمية أكبر من المتبقي للبند: %', v_item.description;
    end if;
  end loop;

  -- 2) إنشاء الإذن
  insert into public.dispense_notes (wo_id, process_name, receiver_name, engineer_name, created_by)
  values (p_wo_id, p_process, p_receiver, p_engineer, v_user.id)
  returning id into v_note_id;
  v_note_no := 'DN-' || to_char(now(), 'YYMM') || '-' || lpad(v_note_id::text, 5, '0');
  update public.dispense_notes set note_no = v_note_no where id = v_note_id;

  -- 3) تنفيذ الصرف + snapshot
  for v_entry in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_entry->>'qty')::numeric;
    select * into v_item from public.wo_bom_items where id = (v_entry->>'bom_item_id')::bigint;

    update public.wo_bom_items set qty_dispensed = qty_dispensed + v_qty
     where id = v_item.id;

    insert into public.wo_bom_dispense_log (bom_item_id, qty, dispensed_by, note)
    values (v_item.id, v_qty, v_user.id, v_note_no);

    v_snapshot := v_snapshot || jsonb_build_object(
      'bom_item_id', v_item.id,
      'description', v_item.description,
      'part_no', v_item.part_no,
      'unit', v_item.unit,
      'requested', v_item.qty,
      'dispensed', v_qty,
      'remaining_after', v_item.qty - (v_item.qty_dispensed + v_qty));
  end loop;

  update public.dispense_notes set items = v_snapshot where id = v_note_id;

  insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('dispense_notes', v_note_id::text, 'INSERT', v_user.id, null,
          jsonb_build_object('note_no', v_note_no, 'wo_id', p_wo_id, 'items', v_snapshot));

  return jsonb_build_object('id', v_note_id, 'note_no', v_note_no, 'items', v_snapshot);
end $$;

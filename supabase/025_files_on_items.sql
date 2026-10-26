-- ============================================================
-- 025 — استلام الملفات على البند مش على أمر الشغل كله
-- • عمود جديد files.work_order_item_id بيربط الملف ببند من بنود الأمر
-- • wo_id بيفضل موجود ويتملى تلقائي من البند، علشان أي شاشة أو تقرير قديم بيقرا الملفات بالأمر يفضل شغال
-- • الملفات القديمة بتفضل على الأمر من غير بند (مافيش نقل تلقائي)
-- لازم يتشغّل قبل نشر نسخة الواجهة اللي بتسجل الملف على البند.
-- Safe to re-run.
-- ============================================================

alter table public.files
  add column if not exists work_order_item_id bigint references public.work_order_items(id) on delete set null;

create index if not exists files_work_order_item_idx on public.files (work_order_item_id);

-- أمر الشغل بيتاخد من البند دايماً (حتى لو الواجهة بعتت رقم أمر غلط)
create or replace function public.files_sync_wo_from_item()
returns trigger language plpgsql as $$
begin
  if new.work_order_item_id is not null then
    select i.wo_id into new.wo_id from public.work_order_items i where i.id = new.work_order_item_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_files_sync_wo_from_item on public.files;
create trigger trg_files_sync_wo_from_item
  before insert or update of work_order_item_id on public.files
  for each row execute function public.files_sync_wo_from_item();

notify pgrst, 'reload schema';

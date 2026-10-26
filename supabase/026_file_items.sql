-- ============================================================
-- 026 — الملف الواحد ممكن يخص أكتر من بند في نفس الأمر
-- • جدول ربط جديد file_items (ملف ↔ بند)
-- • الملفات اللي اتسجلت على بند واحد (عمود work_order_item_id من 025) بتتنقل للجدول
-- • عمود work_order_item_id بيفضل موجود من غير استخدام، علشان ماتضيعش بيانات
-- لازم يتشغّل قبل نشر نسخة الواجهة اللي بتختار أكتر من بند.
-- Safe to re-run.
-- ============================================================

create table if not exists public.file_items (
  file_id bigint not null references public.files(id) on delete cascade,
  item_id bigint not null references public.work_order_items(id) on delete cascade,
  primary key (file_id, item_id)
);
create index if not exists file_items_item_idx on public.file_items (item_id);

-- نقل الملفات المسجلة على بند واحد
insert into public.file_items (file_id, item_id)
select id, work_order_item_id from public.files
where work_order_item_id is not null
on conflict do nothing;

-- البند لازم يكون من نفس أمر الشغل بتاع الملف
create or replace function public.file_items_same_wo()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.files f
    join public.work_order_items i on i.id = new.item_id
    where f.id = new.file_id and f.wo_id = i.wo_id
  ) then
    raise exception 'البند ده مش من نفس أمر الشغل بتاع الملف';
  end if;
  return new;
end $$;

drop trigger if exists trg_file_items_same_wo on public.file_items;
create trigger trg_file_items_same_wo
  before insert or update on public.file_items
  for each row execute function public.file_items_same_wo();

-- الصلاحيات: زي استلام الملفات نفسه، أي مستخدم مسجل يقدر يقرا ويربط
alter table public.file_items enable row level security;
drop policy if exists file_items_read on public.file_items;
create policy file_items_read on public.file_items for select to authenticated using (true);
drop policy if exists file_items_write on public.file_items;
create policy file_items_write on public.file_items for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

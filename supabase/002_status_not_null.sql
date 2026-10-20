-- Make status columns NOT NULL so the database matches the app's types.
-- Safe to run: backfills any NULLs with the column default first.

update public.work_orders set status = 'لم يبدأ' where status is null;
alter table public.work_orders alter column status set not null;

update public.attendance set status = 'حاضر' where status is null;
alter table public.attendance alter column status set not null;

update public.purchases set status = 'مفتوح' where status is null;
alter table public.purchases alter column status set not null;

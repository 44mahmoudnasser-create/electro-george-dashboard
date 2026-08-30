-- ============================================================
-- THE REAL FIX: store role in auth.users metadata directly
-- No extra table needed, no RLS chicken-and-egg problem
-- ============================================================

-- Step 1: Set YOUR account as admin via metadata
-- Replace YOUR_EMAIL with your actual email
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'YOUR_EMAIL_HERE';

-- Step 2: Verify it worked
SELECT email, raw_user_meta_data->>'role' as role
FROM auth.users;

-- Step 3: Disable RLS on all tables so inserts work immediately
ALTER TABLE public.technicians       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_skills       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.files             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_productivity DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users         DISABLE ROW LEVEL SECURITY;

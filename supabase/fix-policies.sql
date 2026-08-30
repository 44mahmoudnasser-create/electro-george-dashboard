-- ============================================================
-- STEP 1: Fix your admin role first (replace YOUR_EMAIL)
-- ============================================================
UPDATE public.app_users
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE');

-- If the row doesn't exist yet, insert it:
INSERT INTO public.app_users (id, email, role)
SELECT id, email, 'admin'
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ============================================================
-- STEP 2: Simplify RLS — allow all authenticated users to
-- read/write everything (you can tighten later)
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'technicians','skills','tech_skills','work_orders',
    'attendance','permissions','overtime','files',
    'violations','purchases','daily_productivity','app_users'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin can write" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin write" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin manages all users" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin reads all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin or secretary write" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON public.%I
       FOR ALL USING (auth.role() = ''authenticated'')
       WITH CHECK (auth.role() = ''authenticated'')',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- STEP 3: Verify your role
-- ============================================================
SELECT u.email, au.role
FROM auth.users u
JOIN public.app_users au ON au.id = u.id;

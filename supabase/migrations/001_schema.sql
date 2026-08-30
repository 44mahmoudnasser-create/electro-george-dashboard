-- ============================================================
-- Electro George - Assembly Department Management System
-- Supabase PostgreSQL Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'secretary', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 
          COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TECHNICIANS
-- ============================================================
CREATE TABLE technicians (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT CHECK (grade IN ('مشرف', 'فني', 'مساعد')),
  route TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SKILLS
-- ============================================================
CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  skill_name TEXT UNIQUE NOT NULL
);

CREATE TABLE tech_skills (
  tech_id INTEGER REFERENCES technicians(id) ON DELETE CASCADE,
  skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (tech_id, skill_id)
);

-- ============================================================
-- WORK ORDERS
-- ============================================================
CREATE TABLE work_orders (
  id SERIAL PRIMARY KEY,
  wo_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'لم يبدأ' 
    CHECK (status IN ('لم يبدأ', 'جاري', 'متوقف', 'مكتمل', 'تم التسليم')),
  created_date DATE DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  completion_date DATE,
  chk_client BOOLEAN DEFAULT FALSE,
  chk_quality BOOLEAN DEFAULT FALSE,
  chk_assembly BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  tech_id INTEGER REFERENCES technicians(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('حاضر', 'غياب', 'أجازة', 'مأمورية')),
  UNIQUE (tech_id, date)
);

-- ============================================================
-- PERMISSIONS (إذونات)
-- ============================================================
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  tech_id INTEGER REFERENCES technicians(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  permission_type TEXT NOT NULL CHECK (permission_type IN (
    'إذن ساعتين صباحي',
    'إذن ساعتين مسائي',
    'إذن نصف يوم صباحي',
    'إذن نصف يوم مسائي'
  )),
  UNIQUE (tech_id, date)
);

-- ============================================================
-- OVERTIME (عمل إضافي)
-- ============================================================
CREATE TABLE overtime (
  id SERIAL PRIMARY KEY,
  tech_id INTEGER REFERENCES technicians(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  has_overtime BOOLEAN DEFAULT FALSE,
  UNIQUE (tech_id, date)
);

-- ============================================================
-- FILES
-- ============================================================
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  wo_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('إضافة', 'تعديل', 'أمر الشغل نفسه')),
  receive_date DATE DEFAULT CURRENT_DATE,
  delivered_to INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  delivery_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIOLATIONS (مخالفات)
-- ============================================================
CREATE TABLE violations (
  id SERIAL PRIMARY KEY,
  tech_id INTEGER REFERENCES technicians(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PURCHASES (طلبات شراء)
-- ============================================================
CREATE TABLE purchases (
  id SERIAL PRIMARY KEY,
  wo_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  request_date DATE DEFAULT CURRENT_DATE,
  supply_date DATE,
  status TEXT DEFAULT 'مفتوح' CHECK (status IN ('مفتوح', 'تم التوريد', 'ملغي')),
  image_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DAILY PRODUCTIVITY
-- ============================================================
CREATE TABLE daily_productivity (
  id SERIAL PRIMARY KEY,
  tech_id INTEGER REFERENCES technicians(id) ON DELETE CASCADE,
  wo_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  task TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_productivity ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- All authenticated users can read everything
CREATE POLICY "authenticated_read" ON technicians FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON tech_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON overtime FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON files FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON violations FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON daily_productivity FOR SELECT TO authenticated USING (true);

-- Admin can do everything
CREATE POLICY "admin_all" ON technicians FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON skills FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON tech_skills FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON work_orders FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON files FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON violations FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON purchases FOR ALL TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "admin_all" ON daily_productivity FOR ALL TO authenticated USING (get_user_role() = 'admin');

-- Secretary can manage attendance, permissions, overtime
CREATE POLICY "secretary_attendance" ON attendance FOR ALL TO authenticated 
  USING (get_user_role() IN ('admin', 'secretary'));
CREATE POLICY "secretary_permissions" ON permissions FOR ALL TO authenticated 
  USING (get_user_role() IN ('admin', 'secretary'));
CREATE POLICY "secretary_overtime" ON overtime FOR ALL TO authenticated 
  USING (get_user_role() IN ('admin', 'secretary'));

-- Profiles: users can read their own, admin reads all
CREATE POLICY "own_profile" ON profiles FOR SELECT TO authenticated USING (id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "admin_profiles" ON profiles FOR ALL TO authenticated USING (get_user_role() = 'admin');

-- ============================================================
-- STORAGE BUCKET for purchase images
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-images', 'purchase-images', false);

CREATE POLICY "auth_upload_images" ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'purchase-images' AND get_user_role() IN ('admin', 'secretary'));
CREATE POLICY "auth_read_images" ON storage.objects FOR SELECT TO authenticated 
  USING (bucket_id = 'purchase-images');
CREATE POLICY "admin_delete_images" ON storage.objects FOR DELETE TO authenticated 
  USING (bucket_id = 'purchase-images' AND get_user_role() = 'admin');

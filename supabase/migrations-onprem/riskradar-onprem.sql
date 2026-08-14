-- =====================================================================
-- RiskRadar — On-Prem Full-Install Bundle
-- Generated: 2026-07-26
-- Contains: bootstrap + 111 application migrations + verifier
-- Range: 20250101000000 .. 20260726064334
--
-- USAGE
--   psql -h <host> -U postgres -d riskradar -v ON_ERROR_STOP=1 \
--        -f supabase/migrations-onprem/riskradar-onprem.sql
-- =====================================================================

-- =====================================================================
-- RiskRadar — On-Premise Bootstrap (run FIRST, once, as a superuser)
-- =====================================================================
-- Purpose: prepare a self-hosted Postgres 15/16 instance so the
-- application migrations (copied verbatim from supabase/migrations/)
-- can run unchanged.
--
-- Target stacks:
--   * Supabase self-hosted (docker-compose) — most objects already exist
--     and CREATE ... IF NOT EXISTS is a no-op. Safe to run.
--   * Vanilla Postgres (no Supabase) — creates the minimum auth surface
--     that our migrations reference (auth.uid(), auth.users, roles).
-- =====================================================================

-- ---------- 1. Extensions -------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- Optional (only if you use scheduled jobs / HTTP calls from SQL):
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ---------- 2. Roles expected by PostgREST / Supabase --------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
  END IF;
  GRANT anon, authenticated, service_role TO authenticator;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---------- 3. auth schema stub (only for vanilla PG deployments) --------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data  jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at    timestamptz
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  )
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- ---------- 4. storage schema stub --------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- ---------- 5. Default privileges for future objects ---------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

BEGIN;

CREATE TABLE IF NOT EXISTS public._onprem_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- Migration: 20250708150210-43f12933-29ed-4433-9975-1edf1bb19491.sql
-- =====================================================================
-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM (
  'RC',      -- Risk Champion
  'RR',      -- Risk Reviewer  
  'RO',      -- Risk Owner
  'RMD',     -- Risk Management Department
  'CRO',     -- Chief Risk Officer
  'ERMSC',   -- ERM Steering Committee
  'EC',      -- Executive Chairman
  'RCB',     -- Risk Committee of the Board
  'ADMIN',   -- Admin
  'USER'     -- General Users
);

-- Create profiles table for additional user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  department TEXT,
  role user_role NOT NULL DEFAULT 'USER',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profile access
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE user_id = user_uuid;
$$;

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'USER')
  );
  RETURN NEW;
END;
$$;

-- Create trigger for automatic profile creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708150210-43f12933-29ed-4433-9975-1edf1bb19491.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708152026-32f37b67-4b14-4388-a440-d90e60a31b41.sql
-- =====================================================================
-- Create risk categories enum
CREATE TYPE public.risk_category AS ENUM (
  'Strategic',
  'Operational', 
  'Financial',
  'Compliance',
  'Technology',
  'Reputational',
  'Environmental',
  'Human Resources'
);

-- Create risk status enum
CREATE TYPE public.risk_status AS ENUM (
  'New',
  'In Review',
  'Mitigated', 
  'Escalated'
);

-- Create risks table
CREATE TABLE public.risks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category risk_category NOT NULL,
  department TEXT,
  owner_id UUID REFERENCES public.profiles(user_id),
  assigned_to_id UUID REFERENCES public.profiles(user_id),
  inherent_likelihood INTEGER NOT NULL CHECK (inherent_likelihood >= 1 AND inherent_likelihood <= 5),
  inherent_impact INTEGER NOT NULL CHECK (inherent_impact >= 1 AND inherent_impact <= 5),
  residual_likelihood INTEGER NOT NULL CHECK (residual_likelihood >= 1 AND residual_likelihood <= 5),
  residual_impact INTEGER NOT NULL CHECK (residual_impact >= 1 AND residual_impact <= 5),
  status risk_status NOT NULL DEFAULT 'New',
  mitigation_plan TEXT,
  mitigation_actions JSONB DEFAULT '[]',
  target_date DATE,
  review_date DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit logs table
CREATE TABLE public.risk_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted'
  changes JSONB, -- stores before/after values
  performed_by UUID NOT NULL REFERENCES public.profiles(user_id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for risks table
-- RC, RR, RO, and RMD can view risks
CREATE POLICY "Authorized users can view risks" 
ON public.risks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RR', 'RO', 'RMD', 'ADMIN')
  )
);

-- RC, RO, and RMD can create risks
CREATE POLICY "Authorized users can create risks" 
ON public.risks 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RO', 'RMD', 'ADMIN')
  )
);

-- RC, RO, and RMD can update risks they created or own
CREATE POLICY "Authorized users can update risks" 
ON public.risks 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RO', 'RMD', 'ADMIN')
  ) AND (
    created_by = auth.uid() OR 
    owner_id = auth.uid() OR
    assigned_to_id = auth.uid()
  )
);

-- Only RMD and ADMIN can delete risks
CREATE POLICY "RMD and ADMIN can delete risks" 
ON public.risks 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RMD', 'ADMIN')
  )
);

-- RLS Policies for audit logs
CREATE POLICY "Authorized users can view audit logs" 
ON public.risk_audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RR', 'RO', 'RMD', 'ADMIN')
  )
);

CREATE POLICY "System can insert audit logs" 
ON public.risk_audit_logs 
FOR INSERT 
WITH CHECK (true);

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION public.create_risk_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (NEW.id, 'updated', jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    ), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for audit logging
CREATE TRIGGER risk_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.create_risk_audit_log();

-- Create trigger for updating updated_at
CREATE TRIGGER update_risks_updated_at
  BEFORE UPDATE ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_risks_status ON public.risks(status);
CREATE INDEX idx_risks_category ON public.risks(category);
CREATE INDEX idx_risks_owner_id ON public.risks(owner_id);
CREATE INDEX idx_risks_created_by ON public.risks(created_by);
CREATE INDEX idx_risks_department ON public.risks(department);
CREATE INDEX idx_audit_logs_risk_id ON public.risk_audit_logs(risk_id);
CREATE INDEX idx_audit_logs_performed_at ON public.risk_audit_logs(performed_at DESC);
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708152026-32f37b67-4b14-4388-a440-d90e60a31b41.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708162059-62ea6db0-ea40-4ae5-9e03-279d364e1bfc.sql
-- =====================================================================
-- Create enum for BCP status
CREATE TYPE public.bcp_status AS ENUM ('Ready', 'Needs Review', 'Outdated');

-- Create enum for test status
CREATE TYPE public.test_status AS ENUM ('Not Tested', 'Passed', 'Failed', 'Overdue');

-- Create business continuity plans table
CREATE TABLE public.business_continuity_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  business_function TEXT NOT NULL,
  dependencies TEXT[],
  mitigation_actions JSONB DEFAULT '[]'::jsonb,
  recovery_time_objective INTEGER, -- RTO in hours
  recovery_point_objective INTEGER, -- RPO in hours
  status bcp_status NOT NULL DEFAULT 'Needs Review',
  test_status test_status NOT NULL DEFAULT 'Not Tested',
  last_tested_date DATE,
  next_test_date DATE,
  last_updated_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supporting_documents JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_continuity_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for BCP access
CREATE POLICY "RMD and critical dept heads can view all BCPs" 
ON public.business_continuity_plans 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  ) 
  OR 
  (department = (SELECT department FROM profiles WHERE user_id = auth.uid()))
);

CREATE POLICY "RMD and dept heads can create BCPs" 
ON public.business_continuity_plans 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD and owners can update BCPs" 
ON public.business_continuity_plans 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  ) 
  OR 
  owner_id = auth.uid() 
  OR 
  created_by = auth.uid()
);

CREATE POLICY "RMD can delete BCPs" 
ON public.business_continuity_plans 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'ADMIN')
  )
);

-- Create storage bucket for BCP documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('bcp-documents', 'bcp-documents', false);

-- Create storage policies for BCP documents
CREATE POLICY "Users can view BCP documents they have access to" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD can upload BCP documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD can update BCP documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD can delete BCP documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'ADMIN')
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bcp_updated_at
BEFORE UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create audit log table for BCP changes
CREATE TABLE public.bcp_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bcp_id UUID NOT NULL REFERENCES public.business_continuity_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changes JSONB,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.bcp_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RMD can view BCP audit logs" 
ON public.bcp_audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

-- Create audit trigger function for BCP changes
CREATE OR REPLACE FUNCTION public.create_bcp_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
    VALUES (NEW.id, 'updated', jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    ), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for BCP audit logging
CREATE TRIGGER bcp_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.business_continuity_plans
FOR EACH ROW EXECUTE FUNCTION public.create_bcp_audit_log();
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708162059-62ea6db0-ea40-4ae5-9e03-279d364e1bfc.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708163233-9400b168-b136-4c38-a80c-c3b4c936a4e7.sql
-- =====================================================================
-- Create enum for document types
CREATE TYPE public.document_type AS ENUM ('Policy', 'SOP', 'Risk Framework', 'Procedure', 'Guideline', 'Standard');

-- Create enum for document status
CREATE TYPE public.document_status AS ENUM ('Draft', 'Under Review', 'Approved', 'Archived', 'Superseded');

-- Create control documents table
CREATE TABLE public.control_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mfiles_id TEXT UNIQUE, -- M-Files object ID
  title TEXT NOT NULL,
  description TEXT,
  document_type document_type NOT NULL,
  document_number TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  status document_status NOT NULL DEFAULT 'Draft',
  owner_id UUID REFERENCES auth.users(id),
  department TEXT,
  effective_date DATE,
  review_date DATE,
  next_review_date DATE,
  file_url TEXT, -- M-Files download URL or local storage
  file_size INTEGER,
  file_extension TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create document acknowledgments table
CREATE TABLE public.document_acknowledgments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.control_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  version_acknowledged TEXT NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id, version_acknowledged)
);

-- Enable RLS
ALTER TABLE public.control_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Create policies for control documents
CREATE POLICY "All authenticated users can view documents" 
ON public.control_documents 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "RMD and document owners can create documents" 
ON public.control_documents 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
    ) 
    OR auth.uid() = owner_id
  )
);

CREATE POLICY "RMD and document owners can update documents" 
ON public.control_documents 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  ) 
  OR owner_id = auth.uid() 
  OR created_by = auth.uid()
);

CREATE POLICY "RMD can delete documents" 
ON public.control_documents 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'ADMIN')
  )
);

-- Create policies for acknowledgments
CREATE POLICY "Users can view their own acknowledgments" 
ON public.document_acknowledgments 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "RMD can view all acknowledgments" 
ON public.document_acknowledgments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "Users can create their own acknowledgments" 
ON public.document_acknowledgments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_control_documents_updated_at
BEFORE UPDATE ON public.control_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_control_documents_type ON public.control_documents(document_type);
CREATE INDEX idx_control_documents_status ON public.control_documents(status);
CREATE INDEX idx_control_documents_owner ON public.control_documents(owner_id);
CREATE INDEX idx_control_documents_department ON public.control_documents(department);
CREATE INDEX idx_document_acknowledgments_document ON public.document_acknowledgments(document_id);
CREATE INDEX idx_document_acknowledgments_user ON public.document_acknowledgments(user_id);
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708163233-9400b168-b136-4c38-a80c-c3b4c936a4e7.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708164816-d0d4d0c8-d206-485e-8da5-1b265e118bf9.sql
-- =====================================================================
-- Create forum categories table
CREATE TABLE public.forum_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create forum discussions table
CREATE TABLE public.forum_discussions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.forum_categories(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  is_moderated BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create forum posts table (replies)
CREATE TABLE public.forum_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discussion_id UUID REFERENCES public.forum_discussions(id) ON DELETE CASCADE NOT NULL,
  parent_post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID NOT NULL,
  is_moderated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create forum votes table
CREATE TABLE public.forum_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  discussion_id UUID REFERENCES public.forum_discussions(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  vote_type TEXT CHECK (vote_type IN ('up', 'down')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, discussion_id),
  UNIQUE(user_id, post_id),
  CHECK ((discussion_id IS NOT NULL AND post_id IS NULL) OR (discussion_id IS NULL AND post_id IS NOT NULL))
);

-- Create forum moderation logs table
CREATE TABLE public.forum_moderation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  moderator_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT CHECK (target_type IN ('discussion', 'post', 'user')) NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training modules table for CSDD integration
CREATE TABLE public.training_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  csdd_module_id TEXT UNIQUE,
  category TEXT,
  duration_minutes INTEGER,
  difficulty_level TEXT CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')),
  external_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default forum categories
INSERT INTO public.forum_categories (name, description, icon, display_order) VALUES
('General', 'General risk management discussions and questions', 'MessageSquare', 1),
('Compliance', 'Regulatory compliance and audit discussions', 'Shield', 2),
('Tools', 'Risk management tools and software discussions', 'Wrench', 3),
('Frameworks', 'Risk frameworks and methodologies', 'BookOpen', 4);

-- Insert sample training modules
INSERT INTO public.training_modules (title, description, csdd_module_id, category, duration_minutes, difficulty_level, external_url) VALUES
('Introduction to ISO 31000', 'Comprehensive overview of ISO 31000 risk management framework', 'CSDD-RM-001', 'Frameworks', 45, 'Beginner', 'https://csdd.portal.com/modules/iso31000-intro'),
('Advanced Risk Assessment Techniques', 'Deep dive into quantitative risk assessment methods', 'CSDD-RM-002', 'Tools', 90, 'Advanced', 'https://csdd.portal.com/modules/advanced-assessment'),
('Regulatory Compliance Updates', 'Latest updates in financial services compliance', 'CSDD-COMP-001', 'Compliance', 30, 'Intermediate', 'https://csdd.portal.com/modules/compliance-updates');

-- Enable Row Level Security
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for forum_categories (readable by all authenticated users)
CREATE POLICY "Categories are viewable by all authenticated users" 
ON public.forum_categories 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage categories" 
ON public.forum_categories 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create RLS policies for forum_discussions
CREATE POLICY "Discussions are viewable by all authenticated users" 
ON public.forum_discussions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can create discussions" 
ON public.forum_discussions 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own discussions" 
ON public.forum_discussions 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = author_id);

CREATE POLICY "Admins can manage all discussions" 
ON public.forum_discussions 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create RLS policies for forum_posts
CREATE POLICY "Posts are viewable by all authenticated users" 
ON public.forum_posts 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can create posts" 
ON public.forum_posts 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own posts" 
ON public.forum_posts 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = author_id);

CREATE POLICY "Admins can manage all posts" 
ON public.forum_posts 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create RLS policies for forum_votes
CREATE POLICY "Users can view all votes" 
ON public.forum_votes 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can manage their own votes" 
ON public.forum_votes 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

-- Create RLS policies for forum_moderation_logs
CREATE POLICY "Moderation logs viewable by admins only" 
ON public.forum_moderation_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "Admins can create moderation logs" 
ON public.forum_moderation_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
) AND auth.uid() = moderator_id);

-- Create RLS policies for training_modules
CREATE POLICY "Training modules are viewable by all authenticated users" 
ON public.training_modules 
FOR SELECT 
TO authenticated 
USING (is_active = true);

CREATE POLICY "Admins can manage training modules" 
ON public.training_modules 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create indexes for better performance
CREATE INDEX idx_forum_discussions_category_id ON public.forum_discussions(category_id);
CREATE INDEX idx_forum_discussions_author_id ON public.forum_discussions(author_id);
CREATE INDEX idx_forum_discussions_last_activity ON public.forum_discussions(last_activity_at DESC);
CREATE INDEX idx_forum_posts_discussion_id ON public.forum_posts(discussion_id);
CREATE INDEX idx_forum_posts_parent_post_id ON public.forum_posts(parent_post_id);
CREATE INDEX idx_forum_posts_author_id ON public.forum_posts(author_id);
CREATE INDEX idx_forum_votes_user_discussion ON public.forum_votes(user_id, discussion_id);
CREATE INDEX idx_forum_votes_user_post ON public.forum_votes(user_id, post_id);
CREATE INDEX idx_training_modules_category ON public.training_modules(category);
CREATE INDEX idx_training_modules_csdd_id ON public.training_modules(csdd_module_id);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_forum_categories_updated_at
BEFORE UPDATE ON public.forum_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forum_discussions_updated_at
BEFORE UPDATE ON public.forum_discussions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forum_posts_updated_at
BEFORE UPDATE ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_training_modules_updated_at
BEFORE UPDATE ON public.training_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create functions to update discussion stats
CREATE OR REPLACE FUNCTION public.update_discussion_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_discussions
    SET reply_count = reply_count + 1,
        last_activity_at = now()
    WHERE id = NEW.discussion_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_discussions
    SET reply_count = reply_count - 1,
        last_activity_at = now()
    WHERE id = OLD.discussion_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update discussion stats
CREATE TRIGGER update_discussion_reply_count
AFTER INSERT OR DELETE ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_discussion_stats();

-- Create function to update view count
CREATE OR REPLACE FUNCTION public.increment_discussion_views()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.forum_discussions
  SET view_count = view_count + 1
  WHERE id = NEW.discussion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708164816-d0d4d0c8-d206-485e-8da5-1b265e118bf9.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708170714-9c492b43-8d2e-4dcf-909f-76fc737959ac.sql
-- =====================================================================
-- Create user_roles table for multiple roles per user
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role user_role NOT NULL,
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create user_login_history table
CREATE TABLE public.user_login_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT
);

-- Create user_activity_logs table
CREATE TABLE public.user_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

-- Enable Row Level Security
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_roles - only admins can manage
CREATE POLICY "Admins can manage user roles" 
ON public.user_roles 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for user_login_history - only admins can view
CREATE POLICY "Admins can view login history" 
ON public.user_login_history 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "System can insert login history" 
ON public.user_login_history 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- RLS policies for user_activity_logs - only admins can view
CREATE POLICY "Admins can view activity logs" 
ON public.user_activity_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "System can insert activity logs" 
ON public.user_activity_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_user_login_history_user_id ON public.user_login_history(user_id);
CREATE INDEX idx_user_login_history_login_at ON public.user_login_history(login_at DESC);
CREATE INDEX idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX idx_user_activity_logs_performed_at ON public.user_activity_logs(performed_at DESC);
CREATE INDEX idx_user_activity_logs_action ON public.user_activity_logs(action);

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(user_uuid UUID)
RETURNS TABLE(role user_role, assigned_at TIMESTAMP WITH TIME ZONE)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ur.role, ur.assigned_at 
  FROM public.user_roles ur 
  WHERE ur.user_id = user_uuid
  ORDER BY ur.assigned_at;
$$;

-- Create function to check if user has specific role
CREATE OR REPLACE FUNCTION public.user_has_role(user_uuid UUID, check_role user_role)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = user_uuid AND role = check_role
  );
$$;

-- Migrate existing roles from profiles to user_roles table
INSERT INTO public.user_roles (user_id, role, assigned_by, assigned_at)
SELECT user_id, role, user_id, created_at
FROM public.profiles
WHERE role IS NOT NULL;

-- Create function to log user activity
CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.user_activity_logs (
    user_id, action, resource_type, resource_id, details
  ) VALUES (
    p_user_id, p_action, p_resource_type, p_resource_id, p_details
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708170714-9c492b43-8d2e-4dcf-909f-76fc737959ac.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708173517-093f9692-4fa3-433f-9258-df7752768f8a.sql
-- =====================================================================
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('info', 'success', 'warning', 'error')) NOT NULL DEFAULT 'info',
  category TEXT CHECK (category IN ('risk_update', 'bcp_change', 'document_upload', 'system', 'user_action')) NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);

-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  risk_updates_email BOOLEAN DEFAULT true,
  bcp_changes_email BOOLEAN DEFAULT true,
  document_uploads_email BOOLEAN DEFAULT false,
  system_alerts_email BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create system audit logs table
CREATE TABLE public.system_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  category TEXT CHECK (category IN ('authentication', 'authorization', 'data_modification', 'system_access', 'configuration')) NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications" 
ON public.notifications 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" 
ON public.notifications 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" 
ON public.notifications 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- RLS policies for notification preferences
CREATE POLICY "Users can manage their own preferences" 
ON public.notification_preferences 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

-- RLS policies for system audit logs
CREATE POLICY "Admins can view all system audit logs" 
ON public.system_audit_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "System can insert audit logs" 
ON public.system_audit_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_category ON public.notifications(category);
CREATE INDEX idx_system_audit_logs_user_id ON public.system_audit_logs(user_id);
CREATE INDEX idx_system_audit_logs_performed_at ON public.system_audit_logs(performed_at DESC);
CREATE INDEX idx_system_audit_logs_category ON public.system_audit_logs(category);
CREATE INDEX idx_system_audit_logs_severity ON public.system_audit_logs(severity);

-- Create trigger for updated_at timestamps on notification preferences
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to send notification
CREATE OR REPLACE FUNCTION public.send_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_category TEXT DEFAULT 'system',
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id, title, message, type, category, resource_type, resource_id, metadata
  ) VALUES (
    p_user_id, p_title, p_message, p_type, p_category, p_resource_type, p_resource_id, p_metadata
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

-- Create function to log system audit
CREATE OR REPLACE FUNCTION public.log_system_audit(
  p_user_id UUID,
  p_action TEXT,
  p_category TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'low'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.system_audit_logs (
    user_id, action, category, resource_type, resource_id, details, severity
  ) VALUES (
    p_user_id, p_action, p_category, p_resource_type, p_resource_id, p_details, p_severity
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- Create triggers for auto-notification on risk updates
CREATE OR REPLACE FUNCTION public.notify_risk_update()
RETURNS TRIGGER AS $$
DECLARE
  risk_title TEXT;
  notification_message TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New risk created
    notification_message := 'New risk "' || NEW.title || '" has been created';
    
    -- Notify relevant users (RMD, CRO, ADMIN)
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT 
      p.user_id,
      'New Risk Created',
      notification_message,
      'info',
      'risk_update',
      'risk',
      NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('RMD', 'CRO', 'ADMIN');
    
    -- Log audit
    PERFORM public.log_system_audit(
      NEW.created_by,
      'risk_created',
      'data_modification',
      'risk',
      NEW.id,
      jsonb_build_object('title', NEW.title, 'category', NEW.category),
      'medium'
    );
    
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Risk updated
    notification_message := 'Risk "' || NEW.title || '" has been updated';
    
    -- Notify relevant users if status changed
    IF OLD.status != NEW.status THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      SELECT 
        p.user_id,
        'Risk Status Updated',
        'Risk "' || NEW.title || '" status changed from ' || OLD.status || ' to ' || NEW.status,
        'warning',
        'risk_update',
        'risk',
        NEW.id
      FROM public.profiles p
      JOIN public.user_roles ur ON p.user_id = ur.user_id
      WHERE ur.role IN ('RMD', 'CRO', 'ADMIN');
    END IF;
    
    -- Log audit
    PERFORM public.log_system_audit(
      auth.uid(),
      'risk_updated',
      'data_modification',
      'risk',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'changes', jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
      ),
      CASE WHEN OLD.status != NEW.status THEN 'high' ELSE 'medium' END
    );
    
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for risk notifications
CREATE TRIGGER risk_notification_trigger
AFTER INSERT OR UPDATE ON public.risks
FOR EACH ROW
EXECUTE FUNCTION public.notify_risk_update();

-- Create triggers for BCP notifications
CREATE OR REPLACE FUNCTION public.notify_bcp_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New BCP created
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT 
      p.user_id,
      'New BCP Created',
      'New Business Continuity Plan "' || NEW.title || '" has been created',
      'info',
      'bcp_change',
      'bcp',
      NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('RMD', 'CRO', 'ADMIN');
    
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- BCP status changed
    IF OLD.status != NEW.status THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      SELECT 
        p.user_id,
        'BCP Status Changed',
        'BCP "' || NEW.title || '" status changed from ' || OLD.status || ' to ' || NEW.status,
        'warning',
        'bcp_change',
        'bcp',
        NEW.id
      FROM public.profiles p
      JOIN public.user_roles ur ON p.user_id = ur.user_id
      WHERE ur.role IN ('RMD', 'CRO', 'ADMIN');
    END IF;
    
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for BCP notifications
CREATE TRIGGER bcp_notification_trigger
AFTER INSERT OR UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.notify_bcp_change();

-- Create triggers for document upload notifications
CREATE OR REPLACE FUNCTION public.notify_document_upload()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New document uploaded
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT 
      p.user_id,
      'New Document Uploaded',
      'New document "' || NEW.title || '" has been uploaded',
      'info',
      'document_upload',
      'document',
      NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('RMD', 'CRO', 'ADMIN');
    
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for document notifications
CREATE TRIGGER document_notification_trigger
AFTER INSERT ON public.control_documents
FOR EACH ROW
EXECUTE FUNCTION public.notify_document_upload();

-- Insert default notification preferences for existing users
INSERT INTO public.notification_preferences (user_id)
SELECT user_id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708173517-093f9692-4fa3-433f-9258-df7752768f8a.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708174725-2f33b054-4256-4e6d-a7ab-6ed9c49e7cf6.sql
-- =====================================================================
-- Create system settings table
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  updated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category, setting_key)
);

-- Create risk categories table
CREATE TABLE public.risk_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create risk scoring matrix table
CREATE TABLE public.risk_scoring_matrix (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  impact_level INTEGER NOT NULL CHECK (impact_level BETWEEN 1 AND 5),
  likelihood_level INTEGER NOT NULL CHECK (likelihood_level BETWEEN 1 AND 5),
  risk_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('Very Low', 'Low', 'Medium', 'High', 'Very High')),
  color TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(impact_level, likelihood_level)
);

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_scoring_matrix ENABLE ROW LEVEL SECURITY;

-- RLS policies for system_settings - only admins can manage
CREATE POLICY "Admins can manage system settings" 
ON public.system_settings 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for risk_categories - admins can manage, others can view
CREATE POLICY "Admins can manage risk categories" 
ON public.risk_categories 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "All users can view risk categories" 
ON public.risk_categories 
FOR SELECT 
TO authenticated 
USING (is_active = true);

-- RLS policies for risk_scoring_matrix - admins can manage, others can view
CREATE POLICY "Admins can manage risk scoring matrix" 
ON public.risk_scoring_matrix 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "All users can view risk scoring matrix" 
ON public.risk_scoring_matrix 
FOR SELECT 
TO authenticated 
USING (true);

-- Create indexes
CREATE INDEX idx_system_settings_category ON public.system_settings(category);
CREATE INDEX idx_system_settings_key ON public.system_settings(setting_key);
CREATE INDEX idx_risk_categories_active ON public.risk_categories(is_active);
CREATE INDEX idx_risk_categories_order ON public.risk_categories(display_order);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_categories_updated_at
BEFORE UPDATE ON public.risk_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_scoring_matrix_updated_at
BEFORE UPDATE ON public.risk_scoring_matrix
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default system settings
INSERT INTO public.system_settings (category, setting_key, setting_value, description, updated_by) VALUES
('security', 'password_policy', '{"min_length": 8, "require_uppercase": true, "require_lowercase": true, "require_numbers": true, "require_symbols": false, "max_age_days": 90}', 'Password policy configuration', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)),
('security', 'session_timeout', '{"inactivity_minutes": 5, "absolute_timeout_hours": 8}', 'Session timeout configuration', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)),
('integrations', 'mfiles_config', '{"server_url": "", "username": "", "password": "", "vault_guid": "", "enabled": false}', 'M-Files integration settings', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)),
('integrations', 'csdd_config', '{"portal_url": "", "api_key": "", "enabled": false}', 'CSDD portal integration settings', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1));

-- Insert default risk categories
INSERT INTO public.risk_categories (name, description, color, display_order) VALUES
('Strategic', 'Risks related to strategic planning and business direction', '#EF4444', 1),
('Operational', 'Risks from day-to-day business operations', '#F97316', 2),
('Financial', 'Risks affecting financial performance and resources', '#10B981', 3),
('Compliance', 'Regulatory and legal compliance risks', '#3B82F6', 4),
('Technology', 'IT and technology-related risks', '#8B5CF6', 5),
('Reputational', 'Risks affecting company reputation and brand', '#EC4899', 6),
('Environmental', 'Environmental and sustainability risks', '#06B6D4', 7),
('Human Resources', 'People and workforce-related risks', '#84CC16', 8);

-- Insert default risk scoring matrix (5x5 matrix)
INSERT INTO public.risk_scoring_matrix (impact_level, likelihood_level, risk_score, risk_level, color) VALUES
-- Very Low Risk (1-4)
(1, 1, 1, 'Very Low', '#10B981'),
(1, 2, 2, 'Very Low', '#10B981'),
(2, 1, 2, 'Very Low', '#10B981'),
(1, 3, 3, 'Very Low', '#10B981'),
-- Low Risk (5-8)
(2, 2, 4, 'Low', '#84CC16'),
(1, 4, 4, 'Low', '#84CC16'),
(3, 1, 3, 'Low', '#84CC16'),
(1, 5, 5, 'Low', '#84CC16'),
(2, 3, 6, 'Low', '#84CC16'),
-- Medium Risk (9-15)
(3, 2, 6, 'Medium', '#F59E0B'),
(2, 4, 8, 'Medium', '#F59E0B'),
(4, 1, 4, 'Medium', '#F59E0B'),
(3, 3, 9, 'Medium', '#F59E0B'),
(2, 5, 10, 'Medium', '#F59E0B'),
(4, 2, 8, 'Medium', '#F59E0B'),
(3, 4, 12, 'Medium', '#F59E0B'),
(5, 1, 5, 'Medium', '#F59E0B'),
(4, 3, 12, 'Medium', '#F59E0B'),
(3, 5, 15, 'Medium', '#F59E0B'),
-- High Risk (16-20)
(5, 2, 10, 'High', '#F97316'),
(4, 4, 16, 'High', '#F97316'),
(5, 3, 15, 'High', '#F97316'),
(4, 5, 20, 'High', '#F97316'),
-- Very High Risk (21-25)
(5, 4, 20, 'Very High', '#EF4444'),
(5, 5, 25, 'Very High', '#EF4444');
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708174725-2f33b054-4256-4e6d-a7ab-6ed9c49e7cf6.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708174928-ef2bd910-c567-49c9-9384-005832404561.sql
-- =====================================================================
-- Insert default system settings with first available user
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Get first admin user, or any user if no admin exists
    SELECT user_id INTO admin_user_id 
    FROM public.profiles 
    WHERE role = 'ADMIN' 
    LIMIT 1;
    
    -- If no admin found, use any user
    IF admin_user_id IS NULL THEN
        SELECT user_id INTO admin_user_id 
        FROM public.profiles 
        LIMIT 1;
    END IF;
    
    -- If still no user found, create a placeholder
    IF admin_user_id IS NULL THEN
        admin_user_id := gen_random_uuid();
    END IF;

    -- Insert default system settings
    INSERT INTO public.system_settings (category, setting_key, setting_value, description, updated_by) VALUES
    ('security', 'password_policy', '{"min_length": 8, "require_uppercase": true, "require_lowercase": true, "require_numbers": true, "require_symbols": false, "max_age_days": 90}', 'Password policy configuration', admin_user_id),
    ('security', 'session_timeout', '{"inactivity_minutes": 5, "absolute_timeout_hours": 8}', 'Session timeout configuration', admin_user_id),
    ('integrations', 'mfiles_config', '{"server_url": "", "username": "", "password": "", "vault_guid": "", "enabled": false}', 'M-Files integration settings', admin_user_id),
    ('integrations', 'csdd_config', '{"portal_url": "", "api_key": "", "enabled": false}', 'CSDD portal integration settings', admin_user_id);
END $$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708174928-ef2bd910-c567-49c9-9384-005832404561.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708175827-a165712a-1181-478a-aab1-d15e6b4333f7.sql
-- =====================================================================
-- Create backup configurations table
CREATE TABLE public.backup_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  backup_type TEXT CHECK (backup_type IN ('incremental', 'full', 'differential')) NOT NULL,
  schedule_cron TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30,
  storage_location TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  enterprise_endpoint TEXT,
  authentication_method TEXT CHECK (authentication_method IN ('api_key', 'oauth', 'certificate')) DEFAULT 'api_key',
  encryption_enabled BOOLEAN DEFAULT true,
  compression_enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup logs table
CREATE TABLE public.backup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  configuration_id UUID NOT NULL,
  backup_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  file_size_bytes BIGINT,
  backup_location TEXT,
  checksum TEXT,
  error_message TEXT,
  duration_seconds INTEGER,
  records_backed_up INTEGER,
  metadata JSONB DEFAULT '{}',
  created_by UUID
);

-- Create recovery checklists table
CREATE TABLE public.recovery_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('system_failure', 'data_corruption', 'security_breach', 'disaster_recovery')) NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) NOT NULL DEFAULT 'medium',
  estimated_time_minutes INTEGER,
  steps JSONB NOT NULL DEFAULT '[]',
  prerequisites JSONB DEFAULT '[]',
  validation_steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup restore operations table
CREATE TABLE public.backup_restore_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_log_id UUID NOT NULL,
  restore_type TEXT CHECK (restore_type IN ('full_system', 'partial_data', 'specific_tables', 'point_in_time')) NOT NULL,
  target_timestamp TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  restored_records INTEGER,
  error_message TEXT,
  validation_results JSONB DEFAULT '{}',
  checklist_id UUID,
  performed_by UUID NOT NULL,
  approved_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.backup_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restore_operations ENABLE ROW LEVEL SECURITY;

-- RLS policies for backup_configurations
CREATE POLICY "Admins can manage backup configurations" 
ON public.backup_configurations 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for backup_logs
CREATE POLICY "Admins can view backup logs" 
ON public.backup_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "System can insert backup logs" 
ON public.backup_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "System can update backup logs" 
ON public.backup_logs 
FOR UPDATE 
TO authenticated 
USING (true);

-- RLS policies for recovery_checklists
CREATE POLICY "Admins can manage recovery checklists" 
ON public.recovery_checklists 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for backup_restore_operations
CREATE POLICY "Admins can manage restore operations" 
ON public.backup_restore_operations 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create indexes for performance
CREATE INDEX idx_backup_configurations_active ON public.backup_configurations(is_active);
CREATE INDEX idx_backup_configurations_schedule ON public.backup_configurations(schedule_cron) WHERE is_active = true;
CREATE INDEX idx_backup_logs_config_id ON public.backup_logs(configuration_id);
CREATE INDEX idx_backup_logs_status ON public.backup_logs(status);
CREATE INDEX idx_backup_logs_started_at ON public.backup_logs(started_at DESC);
CREATE INDEX idx_recovery_checklists_category ON public.recovery_checklists(category);
CREATE INDEX idx_recovery_checklists_priority ON public.recovery_checklists(priority);
CREATE INDEX idx_backup_restore_operations_status ON public.backup_restore_operations(status);

-- Add foreign key constraints
ALTER TABLE public.backup_logs 
ADD CONSTRAINT fk_backup_logs_configuration 
FOREIGN KEY (configuration_id) REFERENCES public.backup_configurations(id) ON DELETE CASCADE;

ALTER TABLE public.backup_restore_operations 
ADD CONSTRAINT fk_restore_backup_log 
FOREIGN KEY (backup_log_id) REFERENCES public.backup_logs(id) ON DELETE CASCADE;

ALTER TABLE public.backup_restore_operations 
ADD CONSTRAINT fk_restore_checklist 
FOREIGN KEY (checklist_id) REFERENCES public.recovery_checklists(id) ON DELETE SET NULL;

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_backup_configurations_updated_at
BEFORE UPDATE ON public.backup_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recovery_checklists_updated_at
BEFORE UPDATE ON public.recovery_checklists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get backup status summary
CREATE OR REPLACE FUNCTION public.get_backup_status_summary()
RETURNS TABLE(
  total_configurations INTEGER,
  active_configurations INTEGER,
  recent_backups_24h INTEGER,
  successful_backups_24h INTEGER,
  failed_backups_24h INTEGER,
  last_full_backup TIMESTAMP WITH TIME ZONE,
  next_scheduled_backup TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM public.backup_configurations) as total_configurations,
    (SELECT COUNT(*)::INTEGER FROM public.backup_configurations WHERE is_active = true) as active_configurations,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours') as recent_backups_24h,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours' AND status = 'completed') as successful_backups_24h,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours' AND status = 'failed') as failed_backups_24h,
    (SELECT MAX(completed_at) FROM public.backup_logs WHERE backup_type = 'full' AND status = 'completed') as last_full_backup,
    (SELECT MIN(started_at) FROM public.backup_logs WHERE status = 'pending') as next_scheduled_backup;
$$;

-- Insert default backup configurations
INSERT INTO public.backup_configurations (name, backup_type, schedule_cron, retention_days, storage_location, created_by) VALUES
('Daily Incremental Backup', 'incremental', '0 2 * * *', 7, '/enterprise/backups/incremental/', (
  SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1
)),
('Weekly Full Backup', 'full', '0 1 * * 0', 30, '/enterprise/backups/full/', (
  SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1
));

-- Insert default recovery checklists
INSERT INTO public.recovery_checklists (title, description, category, priority, estimated_time_minutes, steps, prerequisites, validation_steps, created_by) VALUES
(
  'System Failure Recovery',
  'Complete system failure recovery procedure',
  'system_failure',
  'critical',
  120,
  '[
    {"step": 1, "action": "Assess system status and identify failure scope", "estimated_minutes": 15},
    {"step": 2, "action": "Notify stakeholders and activate incident response team", "estimated_minutes": 10},
    {"step": 3, "action": "Identify most recent successful backup", "estimated_minutes": 5},
    {"step": 4, "action": "Prepare recovery environment", "estimated_minutes": 30},
    {"step": 5, "action": "Restore from backup", "estimated_minutes": 45},
    {"step": 6, "action": "Validate data integrity", "estimated_minutes": 15}
  ]'::jsonb,
  '[
    {"item": "Access to backup storage location"},
    {"item": "Recovery environment prepared"},
    {"item": "Incident response team activated"},
    {"item": "Stakeholder notification completed"}
  ]'::jsonb,
  '[
    {"check": "All critical systems operational"},
    {"check": "Data integrity verified"},
    {"check": "User access restored"},
    {"check": "Backup schedule resumed"}
  ]'::jsonb,
  (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)
),
(
  'Data Corruption Recovery',
  'Recovery procedure for data corruption incidents',
  'data_corruption',
  'high',
  90,
  '[
    {"step": 1, "action": "Isolate corrupted data to prevent spread", "estimated_minutes": 10},
    {"step": 2, "action": "Identify corruption scope and affected tables", "estimated_minutes": 20},
    {"step": 3, "action": "Locate clean backup point before corruption", "estimated_minutes": 15},
    {"step": 4, "action": "Perform selective data restoration", "estimated_minutes": 30},
    {"step": 5, "action": "Verify data integrity and consistency", "estimated_minutes": 15}
  ]'::jsonb,
  '[
    {"item": "Database access credentials"},
    {"item": "Backup verification tools"},
    {"item": "Data integrity checking tools"}
  ]'::jsonb,
  '[
    {"check": "No data corruption detected"},
    {"check": "All relationships intact"},
    {"check": "Application functionality restored"},
    {"check": "Monitoring alerts cleared"}
  ]'::jsonb,
  (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)
);

-- Create function to schedule backup operation
CREATE OR REPLACE FUNCTION public.schedule_backup_operation(
  p_configuration_id UUID,
  p_backup_type TEXT,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  backup_log_id UUID;
BEGIN
  INSERT INTO public.backup_logs (
    configuration_id, backup_type, status, created_by
  ) VALUES (
    p_configuration_id, p_backup_type, 'pending', p_created_by
  ) RETURNING id INTO backup_log_id;
  
  RETURN backup_log_id;
END;
$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708175827-a165712a-1181-478a-aab1-d15e6b4333f7.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708175942-8fa7eab8-b07c-43f0-8682-edaa2aea67e2.sql
-- =====================================================================
-- Create backup configurations table
CREATE TABLE public.backup_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  backup_type TEXT CHECK (backup_type IN ('incremental', 'full', 'differential')) NOT NULL,
  schedule_cron TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30,
  storage_location TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  enterprise_endpoint TEXT,
  authentication_method TEXT CHECK (authentication_method IN ('api_key', 'oauth', 'certificate')) DEFAULT 'api_key',
  encryption_enabled BOOLEAN DEFAULT true,
  compression_enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup logs table
CREATE TABLE public.backup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  configuration_id UUID NOT NULL,
  backup_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  file_size_bytes BIGINT,
  backup_location TEXT,
  checksum TEXT,
  error_message TEXT,
  duration_seconds INTEGER,
  records_backed_up INTEGER,
  metadata JSONB DEFAULT '{}',
  created_by UUID
);

-- Create recovery checklists table
CREATE TABLE public.recovery_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('system_failure', 'data_corruption', 'security_breach', 'disaster_recovery')) NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) NOT NULL DEFAULT 'medium',
  estimated_time_minutes INTEGER,
  steps JSONB NOT NULL DEFAULT '[]',
  prerequisites JSONB DEFAULT '[]',
  validation_steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup restore operations table
CREATE TABLE public.backup_restore_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_log_id UUID NOT NULL,
  restore_type TEXT CHECK (restore_type IN ('full_system', 'partial_data', 'specific_tables', 'point_in_time')) NOT NULL,
  target_timestamp TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  restored_records INTEGER,
  error_message TEXT,
  validation_results JSONB DEFAULT '{}',
  checklist_id UUID,
  performed_by UUID NOT NULL,
  approved_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.backup_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restore_operations ENABLE ROW LEVEL SECURITY;

-- RLS policies for backup_configurations
CREATE POLICY "Admins can manage backup configurations" 
ON public.backup_configurations 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for backup_logs
CREATE POLICY "Admins can view backup logs" 
ON public.backup_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "System can insert backup logs" 
ON public.backup_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "System can update backup logs" 
ON public.backup_logs 
FOR UPDATE 
TO authenticated 
USING (true);

-- RLS policies for recovery_checklists
CREATE POLICY "Admins can manage recovery checklists" 
ON public.recovery_checklists 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for backup_restore_operations
CREATE POLICY "Admins can manage restore operations" 
ON public.backup_restore_operations 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create indexes for performance
CREATE INDEX idx_backup_configurations_active ON public.backup_configurations(is_active);
CREATE INDEX idx_backup_configurations_schedule ON public.backup_configurations(schedule_cron) WHERE is_active = true;
CREATE INDEX idx_backup_logs_config_id ON public.backup_logs(configuration_id);
CREATE INDEX idx_backup_logs_status ON public.backup_logs(status);
CREATE INDEX idx_backup_logs_started_at ON public.backup_logs(started_at DESC);
CREATE INDEX idx_recovery_checklists_category ON public.recovery_checklists(category);
CREATE INDEX idx_recovery_checklists_priority ON public.recovery_checklists(priority);
CREATE INDEX idx_backup_restore_operations_status ON public.backup_restore_operations(status);

-- Add foreign key constraints
ALTER TABLE public.backup_logs 
ADD CONSTRAINT fk_backup_logs_configuration 
FOREIGN KEY (configuration_id) REFERENCES public.backup_configurations(id) ON DELETE CASCADE;

ALTER TABLE public.backup_restore_operations 
ADD CONSTRAINT fk_restore_backup_log 
FOREIGN KEY (backup_log_id) REFERENCES public.backup_logs(id) ON DELETE CASCADE;

ALTER TABLE public.backup_restore_operations 
ADD CONSTRAINT fk_restore_checklist 
FOREIGN KEY (checklist_id) REFERENCES public.recovery_checklists(id) ON DELETE SET NULL;

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_backup_configurations_updated_at
BEFORE UPDATE ON public.backup_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recovery_checklists_updated_at
BEFORE UPDATE ON public.recovery_checklists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get backup status summary
CREATE OR REPLACE FUNCTION public.get_backup_status_summary()
RETURNS TABLE(
  total_configurations INTEGER,
  active_configurations INTEGER,
  recent_backups_24h INTEGER,
  successful_backups_24h INTEGER,
  failed_backups_24h INTEGER,
  last_full_backup TIMESTAMP WITH TIME ZONE,
  next_scheduled_backup TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM public.backup_configurations) as total_configurations,
    (SELECT COUNT(*)::INTEGER FROM public.backup_configurations WHERE is_active = true) as active_configurations,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours') as recent_backups_24h,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours' AND status = 'completed') as successful_backups_24h,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours' AND status = 'failed') as failed_backups_24h,
    (SELECT MAX(completed_at) FROM public.backup_logs WHERE backup_type = 'full' AND status = 'completed') as last_full_backup,
    (SELECT MIN(started_at) FROM public.backup_logs WHERE status = 'pending') as next_scheduled_backup;
$$;

-- Create function to schedule backup operation
CREATE OR REPLACE FUNCTION public.schedule_backup_operation(
  p_configuration_id UUID,
  p_backup_type TEXT,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  backup_log_id UUID;
BEGIN
  INSERT INTO public.backup_logs (
    configuration_id, backup_type, status, created_by
  ) VALUES (
    p_configuration_id, p_backup_type, 'pending', p_created_by
  ) RETURNING id INTO backup_log_id;
  
  RETURN backup_log_id;
END;
$$;

-- Insert default backup configurations
INSERT INTO public.backup_configurations (name, backup_type, schedule_cron, retention_days, storage_location) VALUES
('Daily Incremental Backup', 'incremental', '0 2 * * *', 7, '/enterprise/backups/incremental/'),
('Weekly Full Backup', 'full', '0 1 * * 0', 30, '/enterprise/backups/full/');

-- Insert default recovery checklists
INSERT INTO public.recovery_checklists (title, description, category, priority, estimated_time_minutes, steps, prerequisites, validation_steps) VALUES
(
  'System Failure Recovery',
  'Complete system failure recovery procedure',
  'system_failure',
  'critical',
  120,
  '[
    {"step": 1, "action": "Assess system status and identify failure scope", "estimated_minutes": 15},
    {"step": 2, "action": "Notify stakeholders and activate incident response team", "estimated_minutes": 10},
    {"step": 3, "action": "Identify most recent successful backup", "estimated_minutes": 5},
    {"step": 4, "action": "Prepare recovery environment", "estimated_minutes": 30},
    {"step": 5, "action": "Restore from backup", "estimated_minutes": 45},
    {"step": 6, "action": "Validate data integrity", "estimated_minutes": 15}
  ]'::jsonb,
  '[
    {"item": "Access to backup storage location"},
    {"item": "Recovery environment prepared"},
    {"item": "Incident response team activated"},
    {"item": "Stakeholder notification completed"}
  ]'::jsonb,
  '[
    {"check": "All critical systems operational"},
    {"check": "Data integrity verified"},
    {"check": "User access restored"},
    {"check": "Backup schedule resumed"}
  ]'::jsonb
),
(
  'Data Corruption Recovery',
  'Recovery procedure for data corruption incidents',
  'data_corruption',
  'high',
  90,
  '[
    {"step": 1, "action": "Isolate corrupted data to prevent spread", "estimated_minutes": 10},
    {"step": 2, "action": "Identify corruption scope and affected tables", "estimated_minutes": 20},
    {"step": 3, "action": "Locate clean backup point before corruption", "estimated_minutes": 15},
    {"step": 4, "action": "Perform selective data restoration", "estimated_minutes": 30},
    {"step": 5, "action": "Verify data integrity and consistency", "estimated_minutes": 15}
  ]'::jsonb,
  '[
    {"item": "Database access credentials"},
    {"item": "Backup verification tools"},
    {"item": "Data integrity checking tools"}
  ]'::jsonb,
  '[
    {"check": "No data corruption detected"},
    {"check": "All relationships intact"},
    {"check": "Application functionality restored"},
    {"check": "Monitoring alerts cleared"}
  ]'::jsonb
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708175942-8fa7eab8-b07c-43f0-8682-edaa2aea67e2.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708200834-296aaff2-4082-4c5f-8bb0-5243bd791b44.sql
-- =====================================================================
-- Mark demo accounts as email confirmed
UPDATE auth.users 
SET email_confirmed_at = now(),
    confirmation_sent_at = now()
WHERE email IN ('admin@riskradar.com', 'cro@riskradar.com');

-- Also ensure they have the correct metadata
UPDATE auth.users 
SET raw_user_meta_data = jsonb_build_object(
  'full_name', CASE 
    WHEN email = 'admin@riskradar.com' THEN 'System Administrator'
    WHEN email = 'cro@riskradar.com' THEN 'Chief Risk Officer'
    ELSE raw_user_meta_data->>'full_name'
  END,
  'role', CASE 
    WHEN email = 'admin@riskradar.com' THEN 'ADMIN'
    WHEN email = 'cro@riskradar.com' THEN 'CRO'
    ELSE raw_user_meta_data->>'role'
  END
)
WHERE email IN ('admin@riskradar.com', 'cro@riskradar.com');
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708200834-296aaff2-4082-4c5f-8bb0-5243bd791b44.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708201420-bbbe01a0-e8c3-40be-8f7c-984f3ee2115e.sql
-- =====================================================================
-- Fix infinite recursion in profiles RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create new non-recursive policies
CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'ADMIN'
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708201420-bbbe01a0-e8c3-40be-8f7c-984f3ee2115e.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708201925-f768141c-e7cc-464d-b0dd-683296b4958b.sql
-- =====================================================================
-- Ensure demo users have proper roles in user_roles table
-- First, check if users exist and insert roles if missing
INSERT INTO user_roles (user_id, role, assigned_by)
SELECT 
  u.id, 
  CASE 
    WHEN u.email = 'admin@riskradar.com' THEN 'ADMIN'::user_role
    WHEN u.email = 'cro@riskradar.com' THEN 'CRO'::user_role
    ELSE 'USER'::user_role
  END,
  u.id -- self-assigned for demo purposes
FROM auth.users u
WHERE u.email IN ('admin@riskradar.com', 'cro@riskradar.com')
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = u.id
);

-- Also ensure profiles exist with correct data
INSERT INTO profiles (user_id, email, full_name, role, department)
SELECT 
  u.id,
  u.email,
  CASE 
    WHEN u.email = 'admin@riskradar.com' THEN 'System Administrator'
    WHEN u.email = 'cro@riskradar.com' THEN 'Chief Risk Officer'
    ELSE u.email
  END,
  CASE 
    WHEN u.email = 'admin@riskradar.com' THEN 'ADMIN'::user_role
    WHEN u.email = 'cro@riskradar.com' THEN 'CRO'::user_role
    ELSE 'USER'::user_role
  END,
  CASE 
    WHEN u.email = 'admin@riskradar.com' THEN 'IT Department'
    WHEN u.email = 'cro@riskradar.com' THEN 'Risk Management'
    ELSE 'General'
  END
FROM auth.users u
WHERE u.email IN ('admin@riskradar.com', 'cro@riskradar.com')
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  department = EXCLUDED.department;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708201925-f768141c-e7cc-464d-b0dd-683296b4958b.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708205552-3a410f85-bfe0-4864-884c-cd6a1018b47e.sql
-- =====================================================================
-- Fix infinite recursion in profiles RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create new non-recursive policies
CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'ADMIN'
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708205552-3a410f85-bfe0-4864-884c-cd6a1018b47e.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708212753-d8dedea5-5f46-4342-a1ad-377f7eb90fd8.sql
-- =====================================================================
-- Fix RLS policies to use profiles.role directly instead of user_roles table
-- This should resolve the infinite recursion issue

-- Drop the problematic admin policy that references user_roles
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create a new admin policy that uses the role column directly in the profiles table
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'ADMIN'
  )
);

-- Actually, let's avoid the circular reference entirely by creating a simpler policy
-- that allows admins based on a more direct approach

-- Drop the policy we just created
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create a security definer function to get user role safely
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid();
$$;

-- Now create the admin policy using the security definer function
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (get_current_user_role() = 'ADMIN');
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708212753-d8dedea5-5f46-4342-a1ad-377f7eb90fd8.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708214753-554fd987-6e48-4c2e-8fc9-a3a7eabc2026.sql
-- =====================================================================
-- PHASE 1 & 2: Fix RLS policies to eliminate circular dependencies completely
-- Drop all existing problematic policies on profiles table
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Drop the problematic function that may cause recursion
DROP FUNCTION IF EXISTS get_current_user_role();

-- Create simple, non-recursive policies
-- Users can always view and update their own profile
CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = user_id);

-- Simple admin policy without function calls - just check if the requesting user's role is ADMIN
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (
  auth.uid() IN (
    SELECT user_id FROM profiles WHERE role = 'ADMIN'
  )
);

-- Ensure the profiles table allows inserts during user creation
CREATE POLICY "Allow profile creation during signup" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708214753-554fd987-6e48-4c2e-8fc9-a3a7eabc2026.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708222548-6aacbfb3-98a3-459a-9a12-0c7d1535e239.sql
-- =====================================================================
-- Insert sample Nigerian business context data for risks and BCPs

-- First, let's insert some sample profiles for risk owners and creators
INSERT INTO public.profiles (user_id, email, full_name, role, department) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'adebayo.okafor@riskradar.ng', 'Adebayo Okafor', 'RMD', 'Risk Management'),
('550e8400-e29b-41d4-a716-446655440002', 'fatima.hassan@riskradar.ng', 'Fatima Hassan', 'CRO', 'Executive'),
('550e8400-e29b-41d4-a716-446655440003', 'chioma.eze@riskradar.ng', 'Chioma Eze', 'RC', 'IT Department'),
('550e8400-e29b-41d4-a716-446655440004', 'ibrahim.mohammed@riskradar.ng', 'Ibrahim Mohammed', 'RO', 'Operations'),
('550e8400-e29b-41d4-a716-446655440005', 'ngozi.okwu@riskradar.ng', 'Ngozi Okwu', 'RC', 'Finance'),
('550e8400-e29b-41d4-a716-446655440006', 'yusuf.abdullahi@riskradar.ng', 'Yusuf Abdullahi', 'RO', 'Compliance'),
('550e8400-e29b-41d4-a716-446655440007', 'blessing.nwankwo@riskradar.ng', 'Blessing Nwankwo', 'RC', 'HR'),
('550e8400-e29b-41d4-a716-446655440008', 'ahmed.bello@riskradar.ng', 'Ahmed Bello', 'RO', 'Operations')
ON CONFLICT (user_id) DO NOTHING;

-- Insert 15 risks with Nigerian business context
INSERT INTO public.risks (
  id, title, description, category, department, owner_id, assigned_to_id, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, created_by
) VALUES 
-- High Risk (4 risks) - Score 15-20
('risk-001', 'Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-002', 'Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', '550e8400-e29b-41d4-a716-446655440001'),

('risk-003', 'CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', '550e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440006', 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', '550e8400-e29b-41d4-a716-446655440001'),

('risk-004', 'Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', '550e8400-e29b-41d4-a716-446655440001'),

-- Medium Risk (8 risks) - Score 8-14
('risk-005', 'Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', '550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440007', 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', '550e8400-e29b-41d4-a716-446655440001'),

('risk-006', 'NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440006', 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-007', 'Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', '550e8400-e29b-41d4-a716-446655440001'),

('risk-008', 'Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', '550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440007', 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-009', 'FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440006', 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', '550e8400-e29b-41d4-a716-446655440001'),

('risk-010', 'Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', '550e8400-e29b-41d4-a716-446655440001'),

('risk-011', 'Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', '550e8400-e29b-41d4-a716-446655440001'),

('risk-012', 'ERP System Migration', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', '550e8400-e29b-41d4-a716-446655440001'),

-- Low Risk (3 risks) - Score 5-7
('risk-013', 'Office Space Expansion', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-014', 'Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-015', 'Social Media Reputation', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', '550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440007', 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', '550e8400-e29b-41d4-a716-446655440001');

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  id, title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('bcp-001', 'Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', 4, 1, 'Active', 'Tested', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-002', 'Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', '550e8400-e29b-41d4-a716-446655440005', 2, 0, 'Active', 'Needs Testing',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-003', 'Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', '550e8400-e29b-41d4-a716-446655440004', 1, 0, 'Active', 'Tested',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-004', 'Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', '550e8400-e29b-41d4-a716-446655440008', 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-005', 'Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', '550e8400-e29b-41d4-a716-446655440006', 8, 2, 'Active', 'Needs Testing',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001');

-- Update some timestamps to make data more realistic
UPDATE public.risks SET 
  created_at = created_at - INTERVAL '30 days' + (RANDOM() * INTERVAL '25 days'),
  updated_at = created_at + (RANDOM() * INTERVAL '20 days')
WHERE id LIKE 'risk-%';

UPDATE public.business_continuity_plans SET 
  created_at = created_at - INTERVAL '60 days' + (RANDOM() * INTERVAL '45 days'),
  updated_at = created_at + (RANDOM() * INTERVAL '30 days'),
  last_updated_date = CURRENT_DATE - (RANDOM() * INTERVAL '30 days')::integer,
  next_test_date = CURRENT_DATE + (RANDOM() * INTERVAL '180 days')::integer
WHERE id LIKE 'bcp-%';
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708222548-6aacbfb3-98a3-459a-9a12-0c7d1535e239.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708222802-cba8e33e-0abc-4460-8f45-c3446158ea28.sql
-- =====================================================================
-- Insert sample Nigerian business context data for risks and BCPs
-- Using the current authenticated user for sample data

-- Insert 15 risks with Nigerian business context
INSERT INTO public.risks (
  id, title, description, category, department, owner_id, assigned_to_id, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, created_by
) VALUES 
-- High Risk (4 risks) - Score 15-20
('risk-001', 'Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', auth.uid(), auth.uid(), 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', auth.uid()),

('risk-002', 'Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', auth.uid(), auth.uid(), 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', auth.uid()),

('risk-003', 'CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', auth.uid(), auth.uid(), 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', auth.uid()),

('risk-004', 'Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', auth.uid(), auth.uid(), 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', auth.uid()),

-- Medium Risk (8 risks) - Score 8-14
('risk-005', 'Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', auth.uid(), auth.uid(), 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', auth.uid()),

('risk-006', 'NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', auth.uid(), auth.uid(), 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', auth.uid()),

('risk-007', 'Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', auth.uid(), auth.uid(), 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', auth.uid()),

('risk-008', 'Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', auth.uid(), auth.uid(), 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', auth.uid()),

('risk-009', 'FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', auth.uid(), auth.uid(), 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', auth.uid()),

('risk-010', 'Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', auth.uid(), auth.uid(), 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', auth.uid()),

('risk-011', 'Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', auth.uid(), auth.uid(), 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', auth.uid()),

('risk-012', 'ERP System Migration', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', auth.uid(), auth.uid(), 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', auth.uid()),

-- Low Risk (3 risks) - Score 5-7
('risk-013', 'Office Space Expansion', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', auth.uid(), auth.uid(), 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', auth.uid()),

('risk-014', 'Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', auth.uid(), auth.uid(), 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', auth.uid()),

('risk-015', 'Social Media Reputation', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', auth.uid(), auth.uid(), 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', auth.uid());

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  id, title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('bcp-001', 'Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', auth.uid(), 4, 1, 'Active', 'Tested', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
auth.uid()),

('bcp-002', 'Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', auth.uid(), 2, 0, 'Active', 'Needs Testing',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
auth.uid()),

('bcp-003', 'Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', auth.uid(), 1, 0, 'Active', 'Tested',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
auth.uid()),

('bcp-004', 'Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', auth.uid(), 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
auth.uid()),

('bcp-005', 'Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', auth.uid(), 8, 2, 'Active', 'Needs Testing',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
auth.uid());

-- Update some timestamps to make data more realistic
UPDATE public.risks SET 
  created_at = created_at - INTERVAL '30 days' + (RANDOM() * INTERVAL '25 days'),
  updated_at = created_at + (RANDOM() * INTERVAL '20 days')
WHERE id LIKE 'risk-%';

UPDATE public.business_continuity_plans SET 
  created_at = created_at - INTERVAL '60 days' + (RANDOM() * INTERVAL '45 days'),
  updated_at = created_at + (RANDOM() * INTERVAL '30 days'),
  last_updated_date = CURRENT_DATE - (RANDOM() * INTERVAL '30 days')::integer,
  next_test_date = CURRENT_DATE + (RANDOM() * INTERVAL '180 days')::integer
WHERE id LIKE 'bcp-%';
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708222802-cba8e33e-0abc-4460-8f45-c3446158ea28.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708223016-6718a41b-1afc-4a14-8a07-3a42394277bb.sql
-- =====================================================================
-- Insert sample Nigerian business context data for risks and BCPs
-- Using proper UUID format and current authenticated user

-- Insert 15 risks with Nigerian business context
INSERT INTO public.risks (
  title, description, category, department, owner_id, assigned_to_id, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, created_by
) VALUES 
-- High Risk (4 risks) - Score 15-20
('Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', auth.uid(), auth.uid(), 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', auth.uid()),

('Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', auth.uid(), auth.uid(), 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', auth.uid()),

('CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', auth.uid(), auth.uid(), 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', auth.uid()),

('Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', auth.uid(), auth.uid(), 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', auth.uid()),

-- Medium Risk (8 risks) - Score 8-14
('Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', auth.uid(), auth.uid(), 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', auth.uid()),

('NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', auth.uid(), auth.uid(), 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', auth.uid()),

('Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', auth.uid(), auth.uid(), 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', auth.uid()),

('Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', auth.uid(), auth.uid(), 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', auth.uid()),

('FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', auth.uid(), auth.uid(), 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', auth.uid()),

('Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', auth.uid(), auth.uid(), 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', auth.uid()),

('Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', auth.uid(), auth.uid(), 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', auth.uid()),

('ERP System Migration Risk', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', auth.uid(), auth.uid(), 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', auth.uid()),

-- Low Risk (3 risks) - Score 5-7
('Office Space Expansion Need', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', auth.uid(), auth.uid(), 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', auth.uid()),

('Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', auth.uid(), auth.uid(), 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', auth.uid()),

('Social Media Reputation Risk', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', auth.uid(), auth.uid(), 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', auth.uid());

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', auth.uid(), 4, 1, 'Active', 'Tested', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
auth.uid()),

('Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', auth.uid(), 2, 0, 'Active', 'Needs Testing',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
auth.uid()),

('Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', auth.uid(), 1, 0, 'Active', 'Tested',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
auth.uid()),

('Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', auth.uid(), 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
auth.uid()),

('Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', auth.uid(), 8, 2, 'Active', 'Needs Testing',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
auth.uid());
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708223016-6718a41b-1afc-4a14-8a07-3a42394277bb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708223152-012e9686-5ee3-4397-b3eb-1d17f2cb9cd5.sql
-- =====================================================================
-- Insert sample Nigerian business context data for risks and BCPs
-- Using a placeholder user ID that can be updated later

-- Insert 15 risks with Nigerian business context using a placeholder user
INSERT INTO public.risks (
  title, description, category, department, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, 
  created_by, owner_id, assigned_to_id
) VALUES 
-- High Risk (4 risks) - Score 15-20
('Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

-- Medium Risk (8 risks) - Score 8-14
('Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('ERP System Migration Risk', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

-- Low Risk (3 risks) - Score 5-7
('Office Space Expansion Need', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Social Media Reputation Risk', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87');

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 4, 1, 'Active', 'Tested', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 2, 0, 'Active', 'Needs Testing',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 1, 0, 'Active', 'Tested',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 8, 2, 'Active', 'Needs Testing',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87');
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708223152-012e9686-5ee3-4397-b3eb-1d17f2cb9cd5.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708223348-20459512-bd6d-4202-b62a-6d7fdcc99966.sql
-- =====================================================================
-- Insert sample Nigerian business context data for risks and BCPs
-- Using correct enum values

-- Insert 15 risks with Nigerian business context
INSERT INTO public.risks (
  title, description, category, department, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, 
  created_by, owner_id, assigned_to_id
) VALUES 
-- High Risk (4 risks) - Score 15-20
('Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

-- Medium Risk (8 risks) - Score 8-14
('Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('ERP System Migration Risk', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

-- Low Risk (3 risks) - Score 5-7
('Office Space Expansion Need', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Social Media Reputation Risk', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87');

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 4, 1, 'Ready', 'Passed', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 2, 0, 'Ready', 'Not Tested',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 1, 0, 'Ready', 'Passed',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 8, 2, 'Ready', 'Not Tested',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87');
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708223348-20459512-bd6d-4202-b62a-6d7fdcc99966.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708224633-f272bdd2-237b-45bc-ba68-e1ed047d6803.sql
-- =====================================================================
-- Fix infinite recursion in profiles RLS policies by creating a security definer function

-- First, create a security definer function to get current user role safely
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create a new policy using the security definer function
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.get_current_user_role() = 'ADMIN');

-- Also add a policy for users with multiple roles in user_roles table
CREATE POLICY "Users with admin role can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708224633-f272bdd2-237b-45bc-ba68-e1ed047d6803.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708225224-c7cb6904-e68e-49aa-afba-ed708a3a1667.sql
-- =====================================================================
-- Comprehensive fix for infinite recursion and role consistency issues

-- Step 1: Drop all problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users with admin role can view all profiles" ON public.profiles;

-- Step 2: Create security definer functions that use user_roles as primary source
CREATE OR REPLACE FUNCTION public.get_user_primary_role(user_uuid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Get primary role from user_roles table first, fallback to profiles
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY assigned_at DESC LIMIT 1),
    (SELECT role FROM public.profiles WHERE user_id = user_uuid LIMIT 1),
    'USER'::user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_any_role(user_uuid uuid, check_roles user_role[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = user_uuid AND role = ANY(check_roles)
  );
$$;

-- Step 3: Create non-recursive RLS policies using user_roles table
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles via user_roles" 
ON public.profiles FOR SELECT 
USING (public.user_has_any_role(auth.uid(), ARRAY['ADMIN'::user_role]));

-- Step 4: Update risks table policies to use new functions
DROP POLICY IF EXISTS "Authorized users can view risks" ON public.risks;
CREATE POLICY "Authorized users can view risks" 
ON public.risks FOR SELECT 
USING (public.user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

-- Step 5: Ensure data consistency by creating admin user roles if missing
INSERT INTO public.user_roles (user_id, role, assigned_by)
SELECT p.user_id, 'ADMIN'::user_role, p.user_id
FROM public.profiles p
WHERE p.role = 'ADMIN'::user_role
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = p.user_id AND ur.role = 'ADMIN'::user_role
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 6: Create sample user roles for testing
INSERT INTO public.user_roles (user_id, role, assigned_by)
SELECT p.user_id, p.role, p.user_id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = p.user_id AND ur.role = p.role
)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708225224-c7cb6904-e68e-49aa-afba-ed708a3a1667.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250708225256-a4d96ab0-24ae-4d65-866d-c2e0d0126bfb.sql
-- =====================================================================
-- Comprehensive fix for infinite recursion and role consistency issues (v2)

-- Step 1: Drop ALL existing problematic policies to start fresh
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users with admin role can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authorized users can view risks" ON public.risks;

-- Step 2: Create security definer functions that use user_roles as primary source
CREATE OR REPLACE FUNCTION public.get_user_primary_role(user_uuid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Get primary role from user_roles table first, fallback to profiles
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY assigned_at DESC LIMIT 1),
    (SELECT role FROM public.profiles WHERE user_id = user_uuid LIMIT 1),
    'USER'::user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_any_role(user_uuid uuid, check_roles user_role[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = user_uuid AND role = ANY(check_roles)
  );
$$;

-- Step 3: Create clean, non-recursive RLS policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles via user_roles" 
ON public.profiles FOR SELECT 
USING (public.user_has_any_role(auth.uid(), ARRAY['ADMIN'::user_role]));

-- Step 4: Create new risks policies using secure functions
CREATE POLICY "Authorized users can view risks" 
ON public.risks FOR SELECT 
USING (public.user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

-- Step 5: Ensure data consistency by syncing roles
INSERT INTO public.user_roles (user_id, role, assigned_by)
SELECT p.user_id, p.role, p.user_id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = p.user_id AND ur.role = p.role
)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public._onprem_migrations(filename) VALUES ('20250708225256-a4d96ab0-24ae-4d65-866d-c2e0d0126bfb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20250719212635-1a0bba76-7d4a-48cd-853e-c4e85c9c11b3.sql
-- =====================================================================

-- Create risk assessments table to track assessment history
CREATE TABLE public.risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessment_type TEXT NOT NULL DEFAULT 'current', -- 'inherent', 'residual', 'target'
  likelihood INTEGER NOT NULL CHECK (likelihood >= 1 AND likelihood <= 5),
  impact INTEGER NOT NULL CHECK (impact >= 1 AND impact <= 5),
  control_score INTEGER DEFAULT 0 CHECK (control_score >= 0 AND control_score <= 100),
  notes TEXT,
  assessor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create controls table for individual risk controls
CREATE TABLE public.risk_controls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  control_name TEXT NOT NULL,
  control_type TEXT NOT NULL DEFAULT 'mitigative', -- 'detective', 'mitigative', 'preventive'
  control_description TEXT,
  effectiveness_rating INTEGER DEFAULT 0 CHECK (effectiveness_rating >= 0 AND effectiveness_rating <= 100),
  last_tested_date DATE,
  next_test_date DATE,
  test_frequency TEXT DEFAULT 'annual', -- 'monthly', 'quarterly', 'annual'
  owner_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'planned'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add control-related fields to existing risks table
ALTER TABLE public.risks 
ADD COLUMN control_effectiveness_score INTEGER DEFAULT 0 CHECK (control_effectiveness_score >= 0 AND control_effectiveness_score <= 100),
ADD COLUMN target_control_score INTEGER DEFAULT 80 CHECK (target_control_score >= 0 AND target_control_score <= 100),
ADD COLUMN next_assessment_date DATE,
ADD COLUMN last_assessment_date DATE;

-- Enable RLS on new tables
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_controls ENABLE ROW LEVEL SECURITY;

-- RLS policies for risk_assessments
CREATE POLICY "Authorized users can view risk assessments"
  ON public.risk_assessments FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Authorized users can create risk assessments"
  ON public.risk_assessments FOR INSERT
  WITH CHECK (auth.uid() = assessor_id AND user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Authorized users can update risk assessments"
  ON public.risk_assessments FOR UPDATE
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

-- RLS policies for risk_controls
CREATE POLICY "Authorized users can view risk controls"
  ON public.risk_controls FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Authorized users can manage risk controls"
  ON public.risk_controls FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

-- Add triggers for updated_at columns
CREATE TRIGGER update_risk_assessments_updated_at
  BEFORE UPDATE ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_controls_updated_at
  BEFORE UPDATE ON public.risk_controls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_risk_assessments_risk_id ON public.risk_assessments(risk_id);
CREATE INDEX idx_risk_assessments_date ON public.risk_assessments(assessment_date);
CREATE INDEX idx_risk_controls_risk_id ON public.risk_controls(risk_id);
CREATE INDEX idx_risk_controls_test_date ON public.risk_controls(next_test_date);

INSERT INTO public._onprem_migrations(filename) VALUES ('20250719212635-1a0bba76-7d4a-48cd-853e-c4e85c9c11b3.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20251202093046_eb98be9b-f689-429f-8489-386df1560ebc.sql
-- =====================================================================
-- Add qualitative assessment fields and mitigation budget tracking to risks table
ALTER TABLE public.risks 
ADD COLUMN inherent_likelihood_rationale TEXT,
ADD COLUMN inherent_impact_rationale TEXT,
ADD COLUMN residual_likelihood_rationale TEXT,
ADD COLUMN residual_impact_rationale TEXT,
ADD COLUMN mitigation_budget DECIMAL(15, 2),
ADD COLUMN mitigation_budget_spent DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN mitigation_budget_currency TEXT DEFAULT 'USD';
INSERT INTO public._onprem_migrations(filename) VALUES ('20251202093046_eb98be9b-f689-429f-8489-386df1560ebc.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20251202100019_80184be3-d6ce-47ab-a3bb-9361a70df552.sql
-- =====================================================================
-- Update default currency from USD to NGN (Nigerian Naira)
ALTER TABLE public.risks 
ALTER COLUMN mitigation_budget_currency SET DEFAULT 'NGN';
INSERT INTO public._onprem_migrations(filename) VALUES ('20251202100019_80184be3-d6ce-47ab-a3bb-9361a70df552.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20251202101014_639f869e-a90c-4baa-92b2-59c36438065b.sql
-- =====================================================================
-- Create function to check budget thresholds and send notifications
CREATE OR REPLACE FUNCTION public.check_budget_threshold_and_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilization numeric;
  v_threshold_reached text;
  v_owner_id uuid;
  v_risk_title text;
  v_budget numeric;
  v_spent numeric;
  v_currency text;
BEGIN
  -- Calculate budget utilization percentage
  IF NEW.mitigation_budget IS NOT NULL AND NEW.mitigation_budget > 0 THEN
    v_utilization := (NEW.mitigation_budget_spent / NEW.mitigation_budget) * 100;
    v_owner_id := NEW.owner_id;
    v_risk_title := NEW.title;
    v_budget := NEW.mitigation_budget;
    v_spent := NEW.mitigation_budget_spent;
    v_currency := COALESCE(NEW.mitigation_budget_currency, 'NGN');
    
    -- Determine which threshold was crossed
    IF v_utilization >= 100 AND (OLD.mitigation_budget_spent IS NULL OR 
       (OLD.mitigation_budget_spent / OLD.mitigation_budget * 100) < 100) THEN
      v_threshold_reached := '100';
    ELSIF v_utilization >= 90 AND (OLD.mitigation_budget_spent IS NULL OR 
       (OLD.mitigation_budget_spent / OLD.mitigation_budget * 100) < 90) THEN
      v_threshold_reached := '90';
    ELSIF v_utilization >= 75 AND (OLD.mitigation_budget_spent IS NULL OR 
       (OLD.mitigation_budget_spent / OLD.mitigation_budget * 100) < 75) THEN
      v_threshold_reached := '75';
    END IF;
    
    -- Send notifications if threshold was crossed
    IF v_threshold_reached IS NOT NULL THEN
      -- Notify Risk Owner if exists
      IF v_owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          user_id,
          title,
          message,
          type,
          category,
          resource_type,
          resource_id,
          metadata
        ) VALUES (
          v_owner_id,
          'Budget Alert: ' || v_threshold_reached || '% Utilization',
          'Risk "' || v_risk_title || '" has reached ' || v_threshold_reached || '% budget utilization (' || 
          v_currency || ' ' || v_spent || ' of ' || v_currency || ' ' || v_budget || '). Immediate review recommended.',
          CASE 
            WHEN v_threshold_reached = '100' THEN 'error'
            WHEN v_threshold_reached = '90' THEN 'error'
            ELSE 'warning'
          END,
          'risk_update',
          'risk',
          NEW.id,
          jsonb_build_object(
            'threshold', v_threshold_reached,
            'utilization', v_utilization,
            'budget', v_budget,
            'spent', v_spent,
            'currency', v_currency
          )
        );
      END IF;
      
      -- Notify all RMD users
      INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        category,
        resource_type,
        resource_id,
        metadata
      )
      SELECT 
        p.user_id,
        'Budget Alert: ' || v_threshold_reached || '% Utilization',
        'Risk "' || v_risk_title || '" has reached ' || v_threshold_reached || '% budget utilization (' || 
        v_currency || ' ' || v_spent || ' of ' || v_currency || ' ' || v_budget || '). Review required.',
        CASE 
          WHEN v_threshold_reached = '100' THEN 'error'
          WHEN v_threshold_reached = '90' THEN 'error'
          ELSE 'warning'
        END,
        'risk_update',
        'risk',
        NEW.id,
        jsonb_build_object(
          'threshold', v_threshold_reached,
          'utilization', v_utilization,
          'budget', v_budget,
          'spent', v_spent,
          'currency', v_currency
        )
      FROM public.profiles p
      WHERE p.role = 'RMD';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for budget threshold notifications
DROP TRIGGER IF EXISTS budget_threshold_notification_trigger ON public.risks;
CREATE TRIGGER budget_threshold_notification_trigger
  AFTER INSERT OR UPDATE OF mitigation_budget_spent, mitigation_budget
  ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_budget_threshold_and_notify();

-- Add comment
COMMENT ON FUNCTION public.check_budget_threshold_and_notify() IS 
  'Monitors budget utilization and sends notifications when thresholds (75%, 90%, 100%) are reached';
INSERT INTO public._onprem_migrations(filename) VALUES ('20251202101014_639f869e-a90c-4baa-92b2-59c36438065b.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20251202133745_c9f2e4eb-7c49-4051-abcb-a1c52e00f174.sql
-- =====================================================================
-- Create ai_predictions table to store AI-generated risk predictions
CREATE TABLE public.ai_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_type TEXT NOT NULL DEFAULT 'emerging_risk',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  data_sources JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'converted')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  converted_risk_id UUID REFERENCES public.risks(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authorized users can view AI predictions"
  ON public.ai_predictions
  FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "RMD and above can manage AI predictions"
  ON public.ai_predictions
  FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

-- Create updated_at trigger
CREATE TRIGGER update_ai_predictions_updated_at
  BEFORE UPDATE ON public.ai_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_ai_predictions_status ON public.ai_predictions(status);
CREATE INDEX idx_ai_predictions_category ON public.ai_predictions(category);
CREATE INDEX idx_ai_predictions_expires_at ON public.ai_predictions(expires_at);
INSERT INTO public._onprem_migrations(filename) VALUES ('20251202133745_c9f2e4eb-7c49-4051-abcb-a1c52e00f174.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20251202134645_d6cd46ab-0b14-4899-a27c-4d96ed3ec885.sql
-- =====================================================================
-- Add AI scoring recommendation fields to risks table
ALTER TABLE public.risks 
ADD COLUMN IF NOT EXISTS ai_recommended_likelihood INTEGER,
ADD COLUMN IF NOT EXISTS ai_recommended_impact INTEGER,
ADD COLUMN IF NOT EXISTS ai_score_reasoning TEXT,
ADD COLUMN IF NOT EXISTS ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
ADD COLUMN IF NOT EXISTS ai_score_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ai_score_status TEXT DEFAULT 'none' CHECK (ai_score_status IN ('none', 'pending', 'applied', 'dismissed'));
INSERT INTO public._onprem_migrations(filename) VALUES ('20251202134645_d6cd46ab-0b14-4899-a27c-4d96ed3ec885.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225081439_81aa546a-18b9-4c78-b2e6-a212ba8215eb.sql
-- =====================================================================

-- Report archives table
CREATE TABLE public.board_report_archives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  report_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Report schedules table
CREATE TABLE public.report_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for board_report_archives
ALTER TABLE public.board_report_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Board members and admins can view archives"
  ON public.board_report_archives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'ADMIN')
    )
  );

CREATE POLICY "Authorized users can create archives"
  ON public.board_report_archives FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
    )
  );

CREATE POLICY "System can insert archives"
  ON public.board_report_archives FOR INSERT
  WITH CHECK (true);

-- RLS for report_schedules
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage schedules"
  ON public.report_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
    )
  );

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225081439_81aa546a-18b9-4c78-b2e6-a212ba8215eb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225082229_37aad338-4d6a-428d-b24c-3e4d6af4b57d.sql
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260225082229_37aad338-4d6a-428d-b24c-3e4d6af4b57d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225084824_6ad93920-ad67-4629-a01d-0cd98035a8f5.sql
-- =====================================================================
ALTER TABLE public.business_continuity_plans
  ADD COLUMN IF NOT EXISTS bia_criticality_rating text DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS bia_financial_impact numeric,
  ADD COLUMN IF NOT EXISTS bia_operational_impact text,
  ADD COLUMN IF NOT EXISTS bia_reputational_impact text,
  ADD COLUMN IF NOT EXISTS bia_regulatory_impact text,
  ADD COLUMN IF NOT EXISTS bia_max_tolerable_downtime integer,
  ADD COLUMN IF NOT EXISTS bia_peak_periods text[],
  ADD COLUMN IF NOT EXISTS bia_minimum_resources jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bia_assessment_date date,
  ADD COLUMN IF NOT EXISTS bia_assessed_by uuid,
  ADD COLUMN IF NOT EXISTS test_type text,
  ADD COLUMN IF NOT EXISTS test_scope text,
  ADD COLUMN IF NOT EXISTS test_results text,
  ADD COLUMN IF NOT EXISTS test_findings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS test_conducted_by uuid;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260225084824_6ad93920-ad67-4629-a01d-0cd98035a8f5.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225100823_0995da54-7c35-4fa9-8e4e-7a36742699b9.sql
-- =====================================================================

-- Phase 1a: Add columns to risks table
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS treatment_strategy text DEFAULT 'Mitigate',
  ADD COLUMN IF NOT EXISTS strategic_objective text,
  ADD COLUMN IF NOT EXISTS review_frequency text DEFAULT 'quarterly',
  ADD COLUMN IF NOT EXISTS flagged_for_audit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consecutive_high_assessments integer DEFAULT 0;

-- Phase 1b: Add 'In Treatment' to risk_status enum
ALTER TYPE public.risk_status ADD VALUE IF NOT EXISTS 'In Treatment';

-- Phase 1c: Create risk_history table
CREATE TABLE IF NOT EXISTS public.risk_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL DEFAULT 'update',
  change_summary text
);

ALTER TABLE public.risk_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view risk history"
  ON public.risk_history FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

CREATE POLICY "System can insert risk history"
  ON public.risk_history FOR INSERT
  WITH CHECK (true);

-- Phase 1d: Create trigger to populate risk_history on every update
CREATE OR REPLACE FUNCTION public.record_risk_history()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.risk_history (risk_id, snapshot, changed_by, change_type, change_summary)
  VALUES (
    OLD.id,
    to_jsonb(OLD),
    auth.uid(),
    'update',
    CASE
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'Status changed from ' || OLD.status || ' to ' || NEW.status
      WHEN OLD.residual_likelihood IS DISTINCT FROM NEW.residual_likelihood OR OLD.residual_impact IS DISTINCT FROM NEW.residual_impact
        THEN 'Risk score updated'
      WHEN OLD.treatment_strategy IS DISTINCT FROM NEW.treatment_strategy THEN 'Treatment strategy changed to ' || NEW.treatment_strategy
      ELSE 'Record updated'
    END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_risk_history
  BEFORE UPDATE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.record_risk_history();

-- Phase 1e: Create trigger for auto-audit flagging
CREATE OR REPLACE FUNCTION public.check_consecutive_high_risk()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_score integer;
BEGIN
  v_score := NEW.residual_likelihood * NEW.residual_impact;
  IF v_score >= 15 THEN
    NEW.consecutive_high_assessments := COALESCE(OLD.consecutive_high_assessments, 0) + 1;
    IF NEW.consecutive_high_assessments >= 2 THEN
      NEW.flagged_for_audit := true;
    END IF;
  ELSE
    NEW.consecutive_high_assessments := 0;
    NEW.flagged_for_audit := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_high_risk
  BEFORE UPDATE ON public.risks
  FOR EACH ROW
  WHEN (OLD.residual_likelihood IS DISTINCT FROM NEW.residual_likelihood
     OR OLD.residual_impact IS DISTINCT FROM NEW.residual_impact)
  EXECUTE FUNCTION public.check_consecutive_high_risk();

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225100823_0995da54-7c35-4fa9-8e4e-7a36742699b9.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225112844_8cd0cbb6-45ed-4854-b48e-95ab1a59b888.sql
-- =====================================================================

-- Create strategic_objectives table
CREATE TABLE public.strategic_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategic_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active objectives"
  ON public.strategic_objectives FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage objectives"
  ON public.strategic_objectives FOR ALL
  TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['ADMIN'::user_role, 'RMD'::user_role]));

-- Create departments table
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['ADMIN'::user_role, 'RMD'::user_role]));

-- Seed departments from existing data
INSERT INTO public.departments (name)
SELECT DISTINCT department FROM public.profiles WHERE department IS NOT NULL AND department != ''
UNION
SELECT DISTINCT department FROM public.risks WHERE department IS NOT NULL AND department != ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225112844_8cd0cbb6-45ed-4854-b48e-95ab1a59b888.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225115456_78e27430-cc8c-494d-a8ab-16d1c70a14fb.sql
-- =====================================================================

-- ================================================
-- Feature 2: Treatment Task Management Table
-- ================================================
CREATE TABLE public.risk_mitigation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  evidence_notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_mitigation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view mitigation tasks"
  ON public.risk_mitigation_tasks FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

CREATE POLICY "Risk editors can manage mitigation tasks"
  ON public.risk_mitigation_tasks FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RO','RMD','ADMIN']::user_role[]));

CREATE TRIGGER update_mitigation_tasks_updated_at
  BEFORE UPDATE ON public.risk_mitigation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- Feature 3: Document Vault - Storage Bucket & Table
-- ================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('risk-attachments', 'risk-attachments', false);

CREATE POLICY "Authenticated users can view risk attachment files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'risk-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload risk attachment files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'risk-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete risk attachment files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'risk-attachments' AND auth.role() = 'authenticated');

CREATE TABLE public.risk_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  file_type text,
  attachment_type text NOT NULL DEFAULT 'evidence',
  description text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view risk attachments"
  ON public.risk_attachments FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

CREATE POLICY "Risk editors can manage attachments"
  ON public.risk_attachments FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RO','RMD','ADMIN']::user_role[]));

-- ================================================
-- Feature 1: Workflow Engine - Deadline Check Function
-- ================================================
CREATE OR REPLACE FUNCTION public.check_risk_deadlines()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  -- Upcoming reviews (7 days out)
  FOR r IN
    SELECT id, title, review_date, owner_id, assigned_to_id
    FROM public.risks
    WHERE review_date IS NOT NULL
      AND review_date = CURRENT_DATE + INTERVAL '7 days'
      AND status NOT IN ('Mitigated')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Risk Review Due in 7 Days',
        'Risk "' || r.title || '" is due for review on ' || r.review_date,
        'warning', 'risk_update', 'risk', r.id
      );
    END IF;
    IF r.assigned_to_id IS NOT NULL AND r.assigned_to_id IS DISTINCT FROM r.owner_id THEN
      PERFORM public.send_notification(
        r.assigned_to_id, 'Risk Review Due in 7 Days',
        'Risk "' || r.title || '" is due for review on ' || r.review_date,
        'warning', 'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Overdue reviews
  FOR r IN
    SELECT id, title, review_date, owner_id
    FROM public.risks
    WHERE review_date IS NOT NULL
      AND review_date < CURRENT_DATE
      AND status NOT IN ('Mitigated')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Risk Review Overdue',
        'Risk "' || r.title || '" review was due on ' || r.review_date || '. Please review immediately.',
        'error', 'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Mitigation target dates approaching (7 days) and overdue (1 day past)
  FOR r IN
    SELECT id, title, target_date, owner_id, assigned_to_id
    FROM public.risks
    WHERE target_date IS NOT NULL
      AND status = 'In Treatment'
      AND (target_date = CURRENT_DATE + INTERVAL '7 days'
           OR target_date = CURRENT_DATE - INTERVAL '1 day')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'Mitigation Target Overdue' ELSE 'Mitigation Target Due in 7 Days' END,
        'Risk "' || r.title || '" mitigation target date is ' || r.target_date,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.id
      );
    END IF;
    IF r.assigned_to_id IS NOT NULL AND r.assigned_to_id IS DISTINCT FROM r.owner_id THEN
      PERFORM public.send_notification(
        r.assigned_to_id,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'Mitigation Target Overdue' ELSE 'Mitigation Target Due in 7 Days' END,
        'Risk "' || r.title || '" mitigation target date is ' || r.target_date,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Mitigation task deadlines (3 days out and 1 day overdue)
  FOR r IN
    SELECT t.id, t.title AS task_title, t.due_date, t.assigned_to,
           ri.title AS risk_title, ri.id AS risk_id
    FROM public.risk_mitigation_tasks t
    JOIN public.risks ri ON ri.id = t.risk_id
    WHERE t.status NOT IN ('completed', 'cancelled')
      AND t.due_date IS NOT NULL
      AND (t.due_date = CURRENT_DATE + INTERVAL '3 days'
           OR t.due_date = CURRENT_DATE - INTERVAL '1 day')
  LOOP
    IF r.assigned_to IS NOT NULL THEN
      PERFORM public.send_notification(
        r.assigned_to,
        CASE WHEN r.due_date < CURRENT_DATE THEN 'Mitigation Task Overdue' ELSE 'Mitigation Task Due Soon' END,
        'Task "' || r.task_title || '" for risk "' || r.risk_title || '"',
        CASE WHEN r.due_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.risk_id
      );
    END IF;
  END LOOP;
END;
$$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225115456_78e27430-cc8c-494d-a8ab-16d1c70a14fb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225120452_212dace9-90f7-4c1f-9e17-faef0086708d.sql
-- =====================================================================

SELECT cron.schedule(
  'check-risk-deadlines-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://niquvgluxlnifkquwlrn.supabase.co/functions/v1/check-deadlines',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pcXV2Z2x1eGxuaWZrcXV3bHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5ODQwNDcsImV4cCI6MjA2NzU2MDA0N30.dfccUfnoZ-irNq584TRNQV2cc6Tsz2wvg0sjdB22fQU"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225120452_212dace9-90f7-4c1f-9e17-faef0086708d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225125651_fd514460-55a7-4ff4-8bb5-5c202db8f5db.sql
-- =====================================================================

-- Phase 1a: Add 'Crystallized' to risk_status enum
ALTER TYPE public.risk_status ADD VALUE IF NOT EXISTS 'Crystallized';

-- Phase 1b: Create risk_events table
CREATE TABLE public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  discovered_date date NOT NULL DEFAULT CURRENT_DATE,
  reported_by uuid NOT NULL,
  root_cause text NOT NULL,
  event_description text NOT NULL,
  immediate_response text NOT NULL,
  corrective_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  financial_impact numeric DEFAULT NULL,
  financial_impact_currency text DEFAULT 'NGN',
  operational_impact text DEFAULT NULL,
  reputational_impact text DEFAULT NULL,
  risk_posture text NOT NULL DEFAULT 'Under Review',
  lessons_learned text DEFAULT NULL,
  status text NOT NULL DEFAULT 'Open',
  resolution_date date DEFAULT NULL,
  resolved_by uuid DEFAULT NULL,
  severity text NOT NULL DEFAULT 'Medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_risk_events_risk_id ON public.risk_events(risk_id);
CREATE INDEX idx_risk_events_status ON public.risk_events(status);

-- Updated_at trigger
CREATE TRIGGER update_risk_events_updated_at
  BEFORE UPDATE ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

-- RLS: View policy
CREATE POLICY "Authorized users can view risk events"
  ON public.risk_events FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

-- RLS: Manage policy
CREATE POLICY "Risk editors can manage risk events"
  ON public.risk_events FOR ALL TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RO','RMD','ADMIN']::user_role[]));

-- Update check_risk_deadlines to handle open risk events > 30 days
CREATE OR REPLACE FUNCTION public.check_risk_deadlines()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  -- Upcoming reviews (7 days out)
  FOR r IN
    SELECT id, title, review_date, owner_id, assigned_to_id
    FROM public.risks
    WHERE review_date IS NOT NULL
      AND review_date = CURRENT_DATE + INTERVAL '7 days'
      AND status NOT IN ('Mitigated')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Risk Review Due in 7 Days',
        'Risk "' || r.title || '" is due for review on ' || r.review_date,
        'warning', 'risk_update', 'risk', r.id
      );
    END IF;
    IF r.assigned_to_id IS NOT NULL AND r.assigned_to_id IS DISTINCT FROM r.owner_id THEN
      PERFORM public.send_notification(
        r.assigned_to_id, 'Risk Review Due in 7 Days',
        'Risk "' || r.title || '" is due for review on ' || r.review_date,
        'warning', 'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Overdue reviews
  FOR r IN
    SELECT id, title, review_date, owner_id
    FROM public.risks
    WHERE review_date IS NOT NULL
      AND review_date < CURRENT_DATE
      AND status NOT IN ('Mitigated')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Risk Review Overdue',
        'Risk "' || r.title || '" review was due on ' || r.review_date || '. Please review immediately.',
        'error', 'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Mitigation target dates approaching (7 days) and overdue (1 day past)
  FOR r IN
    SELECT id, title, target_date, owner_id, assigned_to_id
    FROM public.risks
    WHERE target_date IS NOT NULL
      AND status = 'In Treatment'
      AND (target_date = CURRENT_DATE + INTERVAL '7 days'
           OR target_date = CURRENT_DATE - INTERVAL '1 day')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'Mitigation Target Overdue' ELSE 'Mitigation Target Due in 7 Days' END,
        'Risk "' || r.title || '" mitigation target date is ' || r.target_date,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.id
      );
    END IF;
    IF r.assigned_to_id IS NOT NULL AND r.assigned_to_id IS DISTINCT FROM r.owner_id THEN
      PERFORM public.send_notification(
        r.assigned_to_id,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'Mitigation Target Overdue' ELSE 'Mitigation Target Due in 7 Days' END,
        'Risk "' || r.title || '" mitigation target date is ' || r.target_date,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Mitigation task deadlines (3 days out and 1 day overdue)
  FOR r IN
    SELECT t.id, t.title AS task_title, t.due_date, t.assigned_to,
           ri.title AS risk_title, ri.id AS risk_id
    FROM public.risk_mitigation_tasks t
    JOIN public.risks ri ON ri.id = t.risk_id
    WHERE t.status NOT IN ('completed', 'cancelled')
      AND t.due_date IS NOT NULL
      AND (t.due_date = CURRENT_DATE + INTERVAL '3 days'
           OR t.due_date = CURRENT_DATE - INTERVAL '1 day')
  LOOP
    IF r.assigned_to IS NOT NULL THEN
      PERFORM public.send_notification(
        r.assigned_to,
        CASE WHEN r.due_date < CURRENT_DATE THEN 'Mitigation Task Overdue' ELSE 'Mitigation Task Due Soon' END,
        'Task "' || r.task_title || '" for risk "' || r.risk_title || '"',
        CASE WHEN r.due_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.risk_id
      );
    END IF;
  END LOOP;

  -- Open risk events older than 30 days without resolution
  FOR r IN
    SELECT re.id, re.event_description, re.created_at, ri.title AS risk_title,
           ri.id AS risk_id, ri.owner_id
    FROM public.risk_events re
    JOIN public.risks ri ON ri.id = re.risk_id
    WHERE re.status IN ('Open', 'Under Investigation')
      AND re.created_at < now() - INTERVAL '30 days'
      AND re.resolution_date IS NULL
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Unresolved Risk Event (30+ days)',
        'Risk event for "' || r.risk_title || '" has been open for over 30 days. Please resolve or update.',
        'error', 'risk_update', 'risk', r.risk_id
      );
    END IF;
  END LOOP;
END;
$function$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225125651_fd514460-55a7-4ff4-8bb5-5c202db8f5db.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225144722_52209d98-7875-44d9-a736-90cfbc061080.sql
-- =====================================================================

-- Sequence for case reference numbers
CREATE SEQUENCE IF NOT EXISTS whistleblow_case_seq START 1;

-- Core cases table
CREATE TABLE public.whistleblow_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference text UNIQUE NOT NULL,
  reporter_passphrase_hash text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  date_of_incident date,
  location text,
  individuals_involved text,
  evidence_description text,
  priority text,
  status text NOT NULL DEFAULT 'Submitted',
  assigned_to uuid,
  escalated_to uuid,
  escalation_reason text,
  resolution_summary text,
  resolution_date date,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.whistleblow_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'reporter',
  sender_id uuid,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attachments table
CREATE TABLE public.whistleblow_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  uploaded_by_type text NOT NULL DEFAULT 'reporter',
  uploaded_by uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log table
CREATE TABLE public.whistleblow_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid,
  old_value text,
  new_value text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger for cases
CREATE TRIGGER update_whistleblow_cases_updated_at
  BEFORE UPDATE ON public.whistleblow_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.whistleblow_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whistleblow_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whistleblow_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whistleblow_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: whistleblow_cases
CREATE POLICY "Investigators can view cases"
  ON public.whistleblow_cases FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can update cases"
  ON public.whistleblow_cases FOR UPDATE TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

-- RLS: whistleblow_messages
CREATE POLICY "Investigators can view messages"
  ON public.whistleblow_messages FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can insert messages"
  ON public.whistleblow_messages FOR INSERT TO authenticated
  WITH CHECK (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    AND sender_type = 'investigator' AND sender_id = auth.uid());

-- RLS: whistleblow_attachments
CREATE POLICY "Investigators can view attachments"
  ON public.whistleblow_attachments FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can insert attachments"
  ON public.whistleblow_attachments FOR INSERT TO authenticated
  WITH CHECK (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    AND uploaded_by_type = 'investigator' AND uploaded_by = auth.uid());

-- RLS: whistleblow_audit_log
CREATE POLICY "Investigators can view audit log"
  ON public.whistleblow_audit_log FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "System can insert audit log"
  ON public.whistleblow_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('whistleblow-attachments', 'whistleblow-attachments', false);

-- Storage RLS
CREATE POLICY "Investigators can view whistleblow files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whistleblow-attachments' AND user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can upload whistleblow files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whistleblow-attachments' AND user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

-- Deadline monitoring function
CREATE OR REPLACE FUNCTION public.check_whistleblow_deadlines()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Cases unassigned for > 14 days
  FOR r IN
    SELECT id, case_reference, subject
    FROM public.whistleblow_cases
    WHERE assigned_to IS NULL
      AND status = 'Submitted'
      AND created_at < now() - INTERVAL '14 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id,
      'Unassigned Whistleblow Case (14+ days)',
      'Case ' || r.case_reference || ' "' || r.subject || '" has been unassigned for over 14 days.',
      'error', 'whistleblow', 'whistleblow_case', r.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('RMD', 'ADMIN');
  END LOOP;

  -- Cases under investigation > 60 days
  FOR r IN
    SELECT id, case_reference, subject
    FROM public.whistleblow_cases
    WHERE status = 'Investigation'
      AND updated_at < now() - INTERVAL '60 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id,
      'Long-running Investigation (60+ days)',
      'Case ' || r.case_reference || ' "' || r.subject || '" has been under investigation for over 60 days.',
      'warning', 'whistleblow', 'whistleblow_case', r.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('CRO', 'ADMIN');
  END LOOP;
END;
$$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225144722_52209d98-7875-44d9-a736-90cfbc061080.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260225145018_b8902f2d-de44-4c3b-9d9f-ec0cb8caab5d.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.nextval_whistleblow_seq()
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT nextval('whistleblow_case_seq');
$$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260225145018_b8902f2d-de44-4c3b-9d9f-ec0cb8caab5d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421131151_b1d893c6-1c02-4023-a562-929f12accee9.sql
-- =====================================================================
-- Step 1: Enum additions only. Must commit before values can be referenced.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='user_role' AND e.enumlabel='SUPERVISOR') THEN
    ALTER TYPE public.user_role ADD VALUE 'SUPERVISOR';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='risk_type') THEN
    CREATE TYPE public.risk_type AS ENUM ('institutional', 'compliance');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Crystallized') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Crystallized';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Draft') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Draft';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Submitted') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Submitted';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Approved') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Approved';
  END IF;
END $$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421131151_b1d893c6-1c02-4023-a562-929f12accee9.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421131324_9bed54cb-f6a5-4786-8b55-f2af0b06cabb.sql
-- =====================================================================
-- ============================================================================
-- STEP 2: Columns, tables, RLS, indexes (depends on Step 1's enum values)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RISKS TABLE — add Phase 2 + previously expected columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS risk_type public.risk_type NOT NULL DEFAULT 'institutional',
  ADD COLUMN IF NOT EXISTS risk_reference TEXT,
  ADD COLUMN IF NOT EXISTS tax_type TEXT,
  ADD COLUMN IF NOT EXISTS estimated_tax_at_risk NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_sector TEXT,
  ADD COLUMN IF NOT EXISTS tax_sub_sector TEXT,
  ADD COLUMN IF NOT EXISTS compliance_description TEXT,
  ADD COLUMN IF NOT EXISTS information_sources TEXT,
  ADD COLUMN IF NOT EXISTS treatment_owner_id UUID,
  ADD COLUMN IF NOT EXISTS monitoring_officer_id UUID,
  ADD COLUMN IF NOT EXISTS treatment_timeline TEXT,
  ADD COLUMN IF NOT EXISTS mitigation_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS mitigation_budget_spent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_score_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_predicted_score NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_score_explanation TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS control_effectiveness_score INTEGER,
  ADD COLUMN IF NOT EXISTS target_control_score INTEGER,
  ADD COLUMN IF NOT EXISTS treatment_strategy TEXT,
  ADD COLUMN IF NOT EXISTS strategic_objective TEXT,
  ADD COLUMN IF NOT EXISTS review_frequency TEXT,
  ADD COLUMN IF NOT EXISTS flagged_for_audit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS crystallized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crystallization_status TEXT,
  ADD COLUMN IF NOT EXISTS actual_impact_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID;

-- ----------------------------------------------------------------------------
-- 2. AUTO-NUMBERING: IR<YY><MM><SEQ> / CR<YY><MM><SEQ>
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.risk_reference_seq;

CREATE OR REPLACE FUNCTION public.generate_risk_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  yy TEXT;
  mm TEXT;
  seq INTEGER;
BEGIN
  IF NEW.risk_reference IS NOT NULL AND NEW.risk_reference <> '' THEN
    RETURN NEW;
  END IF;
  prefix := CASE WHEN NEW.risk_type = 'compliance' THEN 'CR' ELSE 'IR' END;
  yy := to_char(now(), 'YY');
  mm := to_char(now(), 'MM');
  seq := nextval('public.risk_reference_seq');
  NEW.risk_reference := prefix || yy || mm || lpad(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_risk_reference ON public.risks;
CREATE TRIGGER trg_generate_risk_reference
  BEFORE INSERT ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.generate_risk_reference();

-- ----------------------------------------------------------------------------
-- 3. LOOKUP TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view departments" ON public.departments;
CREATE POLICY "All authenticated can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'ADMIN'));

CREATE TABLE IF NOT EXISTS public.strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.strategic_objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view objectives" ON public.strategic_objectives;
CREATE POLICY "All authenticated can view objectives" ON public.strategic_objectives FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage objectives" ON public.strategic_objectives;
CREATE POLICY "Admins manage objectives" ON public.strategic_objectives FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'ADMIN'));

-- ----------------------------------------------------------------------------
-- 4. RISK ASSESSMENTS / CONTROLS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessment_type TEXT NOT NULL DEFAULT 'periodic',
  likelihood INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  control_score INTEGER,
  notes TEXT,
  assessed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view assessments" ON public.risk_assessments;
CREATE POLICY "Authorized view assessments" ON public.risk_assessments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "Authorized manage assessments" ON public.risk_assessments;
CREATE POLICY "Authorized manage assessments" ON public.risk_assessments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RO','RMD','ADMIN')));

CREATE TABLE IF NOT EXISTS public.risk_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  control_name TEXT NOT NULL,
  control_type TEXT NOT NULL DEFAULT 'preventive',
  description TEXT,
  effectiveness_rating TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  test_frequency TEXT NOT NULL DEFAULT 'quarterly',
  last_tested_date DATE,
  next_test_date DATE,
  owner_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view controls" ON public.risk_controls;
CREATE POLICY "Authorized view controls" ON public.risk_controls FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "Authorized manage controls" ON public.risk_controls;
CREATE POLICY "Authorized manage controls" ON public.risk_controls FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RO','RMD','ADMIN')));

-- ----------------------------------------------------------------------------
-- 5. RISK EVENTS / CRYSTALLIZED INCIDENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID REFERENCES public.risks(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'crystallized',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT NOT NULL,
  impact_amount NUMERIC,
  impact_description TEXT,
  reported_by UUID,
  status TEXT NOT NULL DEFAULT 'reported',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view risk events" ON public.risk_events;
CREATE POLICY "Authorized view risk events" ON public.risk_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','EC','ERMSC','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "Authorized manage risk events" ON public.risk_events;
CREATE POLICY "Authorized manage risk events" ON public.risk_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RO','RMD','ADMIN')));

-- ----------------------------------------------------------------------------
-- 6. RISK HISTORY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  changed_by UUID,
  change_type TEXT NOT NULL DEFAULT 'update',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view risk history" ON public.risk_history;
CREATE POLICY "Authorized view risk history" ON public.risk_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "System insert risk history" ON public.risk_history;
CREATE POLICY "System insert risk history" ON public.risk_history FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 7. AI PREDICTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID REFERENCES public.risks(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL,
  predicted_value JSONB NOT NULL,
  confidence_score NUMERIC,
  model_version TEXT,
  explanation TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view AI predictions" ON public.ai_predictions;
CREATE POLICY "Authorized view AI predictions" ON public.ai_predictions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','EC','ERMSC','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "System insert AI predictions" ON public.ai_predictions;
CREATE POLICY "System insert AI predictions" ON public.ai_predictions FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 8. BOARD REPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_report_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID,
  period_start DATE,
  period_end DATE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.board_report_archives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Executives view board reports" ON public.board_report_archives;
CREATE POLICY "Executives view board reports" ON public.board_report_archives FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','EC','ERMSC','RCB','ADMIN')));
DROP POLICY IF EXISTS "RMD manage board reports" ON public.board_report_archives;
CREATE POLICY "RMD manage board reports" ON public.board_report_archives FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','ADMIN')));

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  recipients JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RMD view schedules" ON public.report_schedules;
CREATE POLICY "RMD view schedules" ON public.report_schedules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "RMD manage schedules" ON public.report_schedules;
CREATE POLICY "RMD manage schedules" ON public.report_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','ADMIN')));

-- ----------------------------------------------------------------------------
-- 9. WHISTLEBLOWING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whistleblow_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,
  follow_up_token TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT true,
  reporter_name TEXT,
  reporter_email TEXT,
  reporter_phone TEXT,
  incident_date DATE,
  incident_location TEXT,
  involved_parties TEXT,
  evidence_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'submitted',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  flagged_unassigned BOOLEAN DEFAULT false,
  flagged_stagnant BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whistleblow_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Investigators view cases" ON public.whistleblow_cases;
CREATE POLICY "Investigators view cases" ON public.whistleblow_cases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "Investigators manage cases" ON public.whistleblow_cases;
CREATE POLICY "Investigators manage cases" ON public.whistleblow_cases FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));

CREATE TABLE IF NOT EXISTS public.whistleblow_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_id UUID,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whistleblow_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Investigators view messages" ON public.whistleblow_messages;
CREATE POLICY "Investigators view messages" ON public.whistleblow_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "Investigators send messages" ON public.whistleblow_messages;
CREATE POLICY "Investigators send messages" ON public.whistleblow_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                      AND role IN ('RMD','CRO','ADMIN')));

CREATE TABLE IF NOT EXISTS public.whistleblow_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID,
  details JSONB DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whistleblow_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Investigators view whistleblow audit" ON public.whistleblow_audit_log;
CREATE POLICY "Investigators view whistleblow audit" ON public.whistleblow_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "System insert whistleblow audit" ON public.whistleblow_audit_log;
CREATE POLICY "System insert whistleblow audit" ON public.whistleblow_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 10. updated_at triggers
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['departments','strategic_objectives','risk_assessments','risk_controls',
                                'risk_events','report_schedules','whistleblow_cases'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 11. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_risks_risk_type ON public.risks(risk_type);
CREATE INDEX IF NOT EXISTS idx_risks_risk_reference ON public.risks(risk_reference);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_risk_id ON public.risk_assessments(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_controls_risk_id ON public.risk_controls(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_risk_id ON public.risk_events(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_history_risk_id ON public.risk_history(risk_id);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_risk_id ON public.ai_predictions(risk_id);
CREATE INDEX IF NOT EXISTS idx_whistleblow_cases_status ON public.whistleblow_cases(status);
CREATE INDEX IF NOT EXISTS idx_whistleblow_messages_case_id ON public.whistleblow_messages(case_id);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421131324_9bed54cb-f6a5-4786-8b55-f2af0b06cabb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421133319_798d7185-b7ca-4adc-b4ae-43cc812ff5c5.sql
-- =====================================================================
-- Add granular AI scoring columns expected by the UI
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS ai_recommended_likelihood INTEGER CHECK (ai_recommended_likelihood IS NULL OR (ai_recommended_likelihood BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS ai_recommended_impact INTEGER CHECK (ai_recommended_impact IS NULL OR (ai_recommended_impact BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS ai_confidence INTEGER CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS ai_score_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS ai_score_generated_at TIMESTAMP WITH TIME ZONE;

-- Trigger to log status transitions for the workflow lifecycle
CREATE OR REPLACE FUNCTION public.log_risk_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (
      NEW.id,
      'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      COALESCE(auth.uid(), NEW.created_by)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_risk_status_change ON public.risks;
CREATE TRIGGER trg_log_risk_status_change
AFTER UPDATE ON public.risks
FOR EACH ROW
EXECUTE FUNCTION public.log_risk_status_change();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421133319_798d7185-b7ca-4adc-b4ae-43cc812ff5c5.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421134854_6d2c0f51-adda-4ed1-b7bf-448ccf60787e.sql
-- =====================================================================
-- 1. Add compliance category enum values
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Registration';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Filing';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Disclosure/Reporting';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Payment';

-- 2. Add taxpayer_segment column
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS taxpayer_segment TEXT;

-- 3. Compliance Risk Register view (security_invoker so RLS on risks applies)
CREATE OR REPLACE VIEW public.compliance_risk_register_view
WITH (security_invoker = true) AS
SELECT
  r.id,
  r.risk_reference,
  r.title,
  r.description,
  r.category,
  r.department,
  r.status,
  r.tax_type,
  r.estimated_tax_at_risk,
  r.tax_sector,
  r.tax_sub_sector,
  r.taxpayer_segment,
  r.compliance_description,
  r.information_sources,
  r.treatment_owner_id,
  r.monitoring_officer_id,
  r.treatment_timeline,
  r.treatment_strategy,
  r.inherent_likelihood,
  r.inherent_impact,
  r.residual_likelihood,
  r.residual_impact,
  r.review_date,
  r.target_date,
  r.created_at,
  r.updated_at,
  r.created_by,
  r.owner_id
FROM public.risks r
WHERE r.risk_type = 'compliance';

GRANT SELECT ON public.compliance_risk_register_view TO authenticated;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421134854_6d2c0f51-adda-4ed1-b7bf-448ccf60787e.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421140311_29c2f3a6-f3f7-4790-bbd0-d6358af198f0.sql
-- =====================================================================
-- ============================================================
-- Phase 3: Number Series & Approval Workflow
-- ============================================================

-- 1. Approval status enum
DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('Draft', 'Submitted', 'Under Review', 'Approved', 'Returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. number_sequences table
CREATE TABLE IF NOT EXISTS public.number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  period_yymm TEXT NOT NULL,
  current_sequence INTEGER NOT NULL DEFAULT 0,
  pad_length INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, period_yymm)
);

ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view number sequences" ON public.number_sequences;
CREATE POLICY "Authenticated can view number sequences"
  ON public.number_sequences FOR SELECT TO authenticated USING (true);

-- writes happen exclusively through the SECURITY DEFINER function below

-- 3. Generic reference number generator
CREATE OR REPLACE FUNCTION public.generate_reference_number(p_entity_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_pad INTEGER := 3;
  v_yymm TEXT := to_char(now(), 'YYMM');
  v_seq INTEGER;
BEGIN
  v_prefix := CASE lower(p_entity_type)
    WHEN 'institutional_risk' THEN 'IR'
    WHEN 'compliance_risk' THEN 'CR'
    WHEN 'bcp' THEN 'BCP'
    WHEN 'incident' THEN 'INC'
    WHEN 'treatment_task' THEN 'TT'
    ELSE upper(substring(p_entity_type from 1 for 3))
  END;

  INSERT INTO public.number_sequences (entity_type, prefix, period_yymm, current_sequence, pad_length)
  VALUES (lower(p_entity_type), v_prefix, v_yymm, 1, v_pad)
  ON CONFLICT (entity_type, period_yymm)
  DO UPDATE SET current_sequence = number_sequences.current_sequence + 1, updated_at = now()
  RETURNING current_sequence INTO v_seq;

  RETURN v_prefix || v_yymm || lpad(v_seq::TEXT, v_pad, '0');
END;
$$;

-- 4. Update existing risks trigger to use the generic generator
CREATE OR REPLACE FUNCTION public.generate_risk_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity TEXT;
BEGIN
  IF NEW.risk_reference IS NOT NULL AND NEW.risk_reference <> '' THEN
    RETURN NEW;
  END IF;
  v_entity := CASE WHEN NEW.risk_type = 'compliance' THEN 'compliance_risk' ELSE 'institutional_risk' END;
  NEW.risk_reference := public.generate_reference_number(v_entity);
  RETURN NEW;
END;
$$;

-- ensure trigger exists
DROP TRIGGER IF EXISTS trg_risks_generate_reference ON public.risks;
CREATE TRIGGER trg_risks_generate_reference
  BEFORE INSERT ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.generate_risk_reference();

-- 5. Add reference_number to business_continuity_plans
ALTER TABLE public.business_continuity_plans
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

CREATE OR REPLACE FUNCTION public.assign_bcp_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := public.generate_reference_number('bcp');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bcp_assign_reference ON public.business_continuity_plans;
CREATE TRIGGER trg_bcp_assign_reference
  BEFORE INSERT ON public.business_continuity_plans
  FOR EACH ROW EXECUTE FUNCTION public.assign_bcp_reference();

CREATE INDEX IF NOT EXISTS idx_bcp_reference_number ON public.business_continuity_plans(reference_number);

-- 6. Add reference_number to risk_events (incidents)
ALTER TABLE public.risk_events
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

CREATE OR REPLACE FUNCTION public.assign_risk_event_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := public.generate_reference_number('incident');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risk_events_assign_reference ON public.risk_events;
CREATE TRIGGER trg_risk_events_assign_reference
  BEFORE INSERT ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.assign_risk_event_reference();

CREATE INDEX IF NOT EXISTS idx_risk_events_reference_number ON public.risk_events(reference_number);

-- 7. Approval workflow columns on risks
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS current_reviewer_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by UUID,
  ADD COLUMN IF NOT EXISTS last_review_comment TEXT;

CREATE INDEX IF NOT EXISTS idx_risks_approval_status ON public.risks(approval_status);

-- 8. approval_history table
CREATE TABLE IF NOT EXISTS public.approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- submitted, reviewed, approved, returned, escalated, reset_to_draft
  from_status public.approval_status,
  to_status public.approval_status NOT NULL,
  actor_id UUID NOT NULL,
  actor_role public.user_role,
  comments TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_history_risk_id ON public.approval_history(risk_id, created_at DESC);

ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized view approval history" ON public.approval_history;
CREATE POLICY "Authorized view approval history"
  ON public.approval_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

DROP POLICY IF EXISTS "Authorized insert approval history" ON public.approval_history;
CREATE POLICY "Authorized insert approval history"
  ON public.approval_history FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
    )
  );

-- 9. Workflow audit log view (joins approval_history with actor profile)
CREATE OR REPLACE VIEW public.risk_workflow_audit_view
WITH (security_invoker = true) AS
SELECT
  ah.id,
  ah.risk_id,
  ah.action,
  ah.from_status,
  ah.to_status,
  ah.actor_id,
  ah.actor_role,
  ah.comments,
  ah.metadata,
  ah.created_at,
  p.full_name AS actor_name,
  p.email AS actor_email,
  p.department AS actor_department,
  r.title AS risk_title,
  r.risk_reference
FROM public.approval_history ah
LEFT JOIN public.profiles p ON p.user_id = ah.actor_id
LEFT JOIN public.risks r ON r.id = ah.risk_id
ORDER BY ah.created_at DESC;

GRANT SELECT ON public.risk_workflow_audit_view TO authenticated;

-- 10. Helper RPC to log an approval action and update the risk atomically
CREATE OR REPLACE FUNCTION public.log_approval_action(
  p_risk_id UUID,
  p_action TEXT,
  p_to_status public.approval_status,
  p_comments TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.approval_status;
  v_actor_role public.user_role;
  v_id UUID;
BEGIN
  SELECT approval_status INTO v_from FROM public.risks WHERE id = p_risk_id;
  SELECT role INTO v_actor_role FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.approval_history (
    risk_id, action, from_status, to_status, actor_id, actor_role, comments, metadata
  ) VALUES (
    p_risk_id, p_action, v_from, p_to_status, auth.uid(), v_actor_role, p_comments, COALESCE(p_metadata,'{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421140311_29c2f3a6-f3f7-4790-bbd0-d6358af198f0.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421140606_e9a8f8da-6b44-4e31-b9fc-db81a11482b6.sql
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_approval_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_type TEXT := 'info';
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status = 'Submitted' THEN
    v_title := 'Risk submitted for review';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') has been submitted and is awaiting review.';
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id, v_title, v_message, 'info', 'approval', 'risk', NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = ANY (ARRAY['RR','RMD','CRO','SUPERVISOR','ADMIN']::user_role[]);

  ELSIF NEW.approval_status = 'Under Review' THEN
    v_title := 'Your risk is under review';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') is being reviewed.';
    IF NEW.submitted_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.submitted_by, v_title, v_message, 'info', 'approval', 'risk', NEW.id);
    END IF;

  ELSIF NEW.approval_status = 'Returned' THEN
    v_title := 'Risk returned for revision';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') was returned.' ||
      CASE WHEN NEW.last_review_comment IS NOT NULL THEN ' Comments: ' || NEW.last_review_comment ELSE '' END;
    IF NEW.submitted_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.submitted_by, v_title, v_message, 'warning', 'approval', 'risk', NEW.id);
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM NEW.submitted_by THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.created_by, v_title, v_message, 'warning', 'approval', 'risk', NEW.id);
    END IF;

  ELSIF NEW.approval_status = 'Approved' THEN
    v_title := 'Risk approved';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') has been approved.';
    -- notify submitter / author
    IF NEW.submitted_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.submitted_by, v_title, v_message, 'success', 'approval', 'risk', NEW.id);
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM NEW.submitted_by THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.created_by, v_title, v_message, 'success', 'approval', 'risk', NEW.id);
    END IF;
    -- inform CRO + RMD
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id, v_title, v_message, 'success', 'approval', 'risk', NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = ANY (ARRAY['CRO','RMD']::user_role[]);
  END IF;

  -- Escalation (status flip, regardless of approval_status)
  IF NEW.status = 'Escalated' AND OLD.status IS DISTINCT FROM 'Escalated' THEN
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id,
      'Risk escalated to executive attention',
      'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') has been escalated.',
      'warning', 'approval', 'risk', NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = ANY (ARRAY['EC','ERMSC','RCB','CRO']::user_role[]);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_approval_status_change ON public.risks;
CREATE TRIGGER trg_notify_approval_status_change
  AFTER UPDATE ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_approval_status_change();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421140606_e9a8f8da-6b44-4e31-b9fc-db81a11482b6.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421141416_f96b04e2-b0a8-47fc-b473-3dfd3e943841.sql
-- =====================================================================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421141416_f96b04e2-b0a8-47fc-b473-3dfd3e943841.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421141635_3a091df2-da35-4f65-a32f-b083c3c0ed39.sql
-- =====================================================================
-- Restore authenticated grants on tables that lost them
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_continuity_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_controls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bcp_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_acknowledgments TO authenticated;
GRANT SELECT ON public.departments TO authenticated;
GRANT SELECT ON public.strategic_objectives TO authenticated;
GRANT SELECT ON public.risk_categories TO authenticated;
GRANT SELECT ON public.risk_scoring_matrix TO authenticated;
GRANT SELECT ON public.forum_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_discussions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_votes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_moderation_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_report_archives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_predictions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_activity_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_login_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_configurations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_restore_operations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.number_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whistleblow_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whistleblow_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whistleblow_audit_log TO authenticated;
GRANT SELECT ON public.compliance_risk_register_view TO authenticated;
GRANT SELECT ON public.risk_workflow_audit_view TO authenticated;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421141635_3a091df2-da35-4f65-a32f-b083c3c0ed39.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421142416_fe2957b9-15fb-4796-9bcb-d7cfc2aa7335.sql
-- =====================================================================
-- Add risk_type to RiskData by exposing it (already exists in DB) — no schema change needed for that.

-- 1. Trigger: log profile role changes into system_audit_logs
CREATE OR REPLACE FUNCTION public.log_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'profile_role_changed',
      'authorization',
      'profile',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'target_email', NEW.email,
        'from_role', OLD.role,
        'to_role', NEW.role
      ),
      'high'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_role_change ON public.profiles;
CREATE TRIGGER trg_log_profile_role_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_role_change();

-- 2. Trigger: log user_roles assignment / removal
CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(auth.uid(), NEW.assigned_by),
      'user_role_assigned',
      'authorization',
      'user_role',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'role', NEW.role
      ),
      'high'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'user_role_revoked',
      'authorization',
      'user_role',
      OLD.id,
      jsonb_build_object(
        'target_user_id', OLD.user_id,
        'role', OLD.role
      ),
      'high'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_user_role_change ON public.user_roles;
CREATE TRIGGER trg_log_user_role_change
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_role_change();

-- 3. Trigger: log approval-status transitions to system_audit_logs (in addition to approval_history)
CREATE OR REPLACE FUNCTION public.log_approval_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'risk_approval_status_changed',
      'data_modification',
      'risk',
      NEW.id,
      jsonb_build_object(
        'risk_reference', NEW.risk_reference,
        'title', NEW.title,
        'from_status', OLD.approval_status,
        'to_status', NEW.approval_status,
        'comment', NEW.last_review_comment
      ),
      'high'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_approval_status_audit ON public.risks;
CREATE TRIGGER trg_log_approval_status_audit
  AFTER UPDATE ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_approval_status_audit();

-- 4. Trigger: log BCP status transitions to system_audit_logs
CREATE OR REPLACE FUNCTION public.log_bcp_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'bcp_status_changed',
      'data_modification',
      'bcp',
      NEW.id,
      jsonb_build_object(
        'reference_number', NEW.reference_number,
        'title', NEW.title,
        'from_status', OLD.status,
        'to_status', NEW.status
      ),
      'medium'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_bcp_status_audit ON public.business_continuity_plans;
CREATE TRIGGER trg_log_bcp_status_audit
  AFTER UPDATE ON public.business_continuity_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.log_bcp_status_audit();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421142416_fe2957b9-15fb-4796-9bcb-d7cfc2aa7335.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421143035_1736f2a2-ca25-4c44-924b-91614ff2db68.sql
-- =====================================================================
-- Add missing incident columns expected by the dashboard and crystallization dialog
ALTER TABLE public.risk_events
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS discovered_date date,
  ADD COLUMN IF NOT EXISTS resolution_date date,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS risk_posture text,
  ADD COLUMN IF NOT EXISTS financial_impact numeric,
  ADD COLUMN IF NOT EXISTS financial_impact_currency text DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS event_description text,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS immediate_response text,
  ADD COLUMN IF NOT EXISTS corrective_actions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operational_impact text,
  ADD COLUMN IF NOT EXISTS reputational_impact text,
  ADD COLUMN IF NOT EXISTS lessons_learned text,
  ADD COLUMN IF NOT EXISTS title text;

-- Backfill event_date from occurred_at where missing so existing rows render
UPDATE public.risk_events
SET event_date = occurred_at::date
WHERE event_date IS NULL AND occurred_at IS NOT NULL;

-- Backfill severity for legacy rows
UPDATE public.risk_events
SET severity = 'Medium'
WHERE severity IS NULL;

UPDATE public.risk_events
SET risk_posture = 'Under Review'
WHERE risk_posture IS NULL;

CREATE INDEX IF NOT EXISTS idx_risk_events_event_date ON public.risk_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity ON public.risk_events(severity);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421143035_1736f2a2-ca25-4c44-924b-91614ff2db68.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421170727_f99df3fb-12ac-4d3e-9ece-212adef26bed.sql
-- =====================================================================
-- Phase 4: Risk Appetite & Tolerance

CREATE TABLE public.risk_appetite_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category public.risk_category,
  risk_type public.risk_type NOT NULL,
  taxpayer_segment TEXT,
  tolerance_level TEXT NOT NULL,
  threshold_score INTEGER NOT NULL CHECK (threshold_score BETWEEN 1 AND 25),
  escalation_action TEXT NOT NULL DEFAULT 'notify',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup index (no immutability issue — only column refs)
CREATE INDEX idx_risk_appetite_lookup
  ON public.risk_appetite_config (risk_type, category, taxpayer_segment)
  WHERE is_active = true;

-- RLS
ALTER TABLE public.risk_appetite_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view appetite config"
  ON public.risk_appetite_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage appetite config"
  ON public.risk_appetite_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
    )
  );

CREATE TRIGGER trg_risk_appetite_config_updated_at
  BEFORE UPDATE ON public.risk_appetite_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve most specific appetite for a risk
CREATE OR REPLACE FUNCTION public.resolve_risk_appetite(
  p_risk_type public.risk_type,
  p_category public.risk_category,
  p_taxpayer_segment TEXT
)
RETURNS TABLE (
  id UUID,
  tolerance_level TEXT,
  threshold_score INTEGER,
  escalation_action TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rac.id, rac.tolerance_level, rac.threshold_score, rac.escalation_action
  FROM public.risk_appetite_config rac
  WHERE rac.is_active = true
    AND rac.risk_type = p_risk_type
    AND (rac.category IS NULL OR rac.category = p_category)
    AND (
      rac.taxpayer_segment IS NULL
      OR (p_taxpayer_segment IS NOT NULL AND rac.taxpayer_segment = p_taxpayer_segment)
    )
  ORDER BY
    (rac.category IS NOT NULL)::int DESC,
    (rac.taxpayer_segment IS NOT NULL)::int DESC,
    rac.threshold_score ASC
  LIMIT 1;
$$;

-- Auto-escalation trigger
CREATE OR REPLACE FUNCTION public.enforce_risk_appetite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER;
  v_old_score INTEGER;
  v_appetite RECORD;
  v_segment TEXT;
  v_msg TEXT;
BEGIN
  IF NEW.approval_status <> 'Approved' THEN
    RETURN NEW;
  END IF;

  v_score := COALESCE(NEW.residual_likelihood, 0) * COALESCE(NEW.residual_impact, 0);

  IF TG_OP = 'UPDATE' THEN
    v_old_score := COALESCE(OLD.residual_likelihood, 0) * COALESCE(OLD.residual_impact, 0);
  ELSE
    v_old_score := 0;
  END IF;

  v_segment := CASE WHEN NEW.risk_type = 'compliance' THEN NEW.taxpayer_segment ELSE NULL END;

  SELECT * INTO v_appetite
  FROM public.resolve_risk_appetite(NEW.risk_type, NEW.category, v_segment);

  IF v_appetite.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_score >= v_appetite.threshold_score AND v_old_score < v_appetite.threshold_score THEN
    v_msg := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference, '-') ||
             ') residual score ' || v_score || ' has exceeded the configured ' ||
             v_appetite.tolerance_level || ' appetite threshold (' || v_appetite.threshold_score || ').';

    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id, metadata)
    SELECT DISTINCT p.user_id,
      'Risk exceeds appetite threshold',
      v_msg,
      'warning',
      'risk_update',
      'risk',
      NEW.id,
      jsonb_build_object(
        'threshold_score', v_appetite.threshold_score,
        'risk_score', v_score,
        'tolerance_level', v_appetite.tolerance_level,
        'escalation_action', v_appetite.escalation_action
      )
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id IN (NEW.owner_id, NEW.created_by, NEW.assigned_to_id)
       OR ur.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]);

    IF v_appetite.escalation_action = 'escalate' AND NEW.status <> 'Escalated' THEN
      NEW.status := 'Escalated'::risk_status;
    ELSIF v_appetite.escalation_action = 'flag_audit' THEN
      NEW.flagged_for_audit := true;
    END IF;

    PERFORM public.log_system_audit(
      auth.uid(),
      'risk_exceeded_appetite',
      'data_modification',
      'risk',
      NEW.id,
      jsonb_build_object(
        'risk_reference', NEW.risk_reference,
        'risk_score', v_score,
        'threshold_score', v_appetite.threshold_score,
        'tolerance_level', v_appetite.tolerance_level,
        'escalation_action', v_appetite.escalation_action
      ),
      'high'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_risk_appetite
  BEFORE INSERT OR UPDATE OF residual_likelihood, residual_impact, approval_status, category, taxpayer_segment
  ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_risk_appetite();

-- Seed defaults
INSERT INTO public.risk_appetite_config (risk_type, category, taxpayer_segment, tolerance_level, threshold_score, escalation_action, description)
VALUES
  ('institutional', NULL, NULL, 'Medium', 12, 'notify',     'Default institutional appetite — notify when residual score ≥ 12'),
  ('institutional', 'Strategic', NULL, 'Low', 9, 'escalate', 'Strategic risks escalate at score ≥ 9'),
  ('institutional', 'Financial', NULL, 'Medium', 12, 'escalate', 'Financial risks escalate at score ≥ 12'),
  ('institutional', 'Operational', NULL, 'Medium', 15, 'notify', 'Operational risks notify at score ≥ 15'),
  ('compliance', NULL, 'Large',    'Low',     8,  'escalate',   'Large taxpayers — low tolerance, escalate at ≥ 8'),
  ('compliance', NULL, 'Medium',   'Medium',  12, 'notify',     'Medium taxpayers — notify at ≥ 12'),
  ('compliance', NULL, 'Emerging', 'High',    16, 'flag_audit', 'Emerging taxpayers — flag for audit at ≥ 16');
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421170727_f99df3fb-12ac-4d3e-9ece-212adef26bed.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260421174610_9b081eda-8824-4af0-83a2-78e9bb4990ab.sql
-- =====================================================================
-- Add unique constraint on setting_key (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_setting_key_unique'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_setting_key_unique UNIQUE (setting_key);
  END IF;
END $$;

-- Phase 5: control effectiveness + post-control reassessment
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS control_effectiveness_rating text
    CHECK (control_effectiveness_rating IN ('High', 'Medium', 'Low'));

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS post_control_likelihood integer CHECK (post_control_likelihood BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS post_control_impact integer CHECK (post_control_impact BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS post_control_assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_control_assessed_by uuid,
  ADD COLUMN IF NOT EXISTS post_control_notes text;

-- Phase 5: Matrix dimensions setting
INSERT INTO public.system_settings (setting_key, setting_value, category, description)
VALUES (
  'matrix_dimensions',
  jsonb_build_object('institutional', 5, 'compliance', 5),
  'risk_matrix',
  'Configurable matrix size per register type (4 or 5)'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Phase 6: Integration placeholders
INSERT INTO public.system_settings (setting_key, setting_value, category, description) VALUES
  ('integration_mfiles', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'vault_id', '', 'status', 'coming_soon'), 'integrations', 'M-Files EDRMS document repository'),
  ('integration_active_directory', jsonb_build_object('enabled', false, 'domain', '', 'ldap_url', '', 'bind_dn', '', 'bind_password', '', 'status', 'coming_soon'), 'integrations', 'Active Directory authentication & user provisioning'),
  ('integration_cac', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'environment', 'sandbox', 'status', 'coming_soon'), 'integrations', 'Corporate Affairs Commission registry verification'),
  ('integration_nimc', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'merchant_id', '', 'status', 'coming_soon'), 'integrations', 'NIMC National Identity verification'),
  ('integration_nitda', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'organisation_code', '', 'status', 'coming_soon'), 'integrations', 'NITDA data protection compliance reporting')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260421174610_9b081eda-8824-4af0-83a2-78e9bb4990ab.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423093956_098286e8-7aff-43fb-9f9b-7b93ab7b84a0.sql
-- =====================================================================
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strategic_objectives TO authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS inherent_likelihood_rationale TEXT,
  ADD COLUMN IF NOT EXISTS inherent_impact_rationale TEXT,
  ADD COLUMN IF NOT EXISTS residual_likelihood_rationale TEXT,
  ADD COLUMN IF NOT EXISTS residual_impact_rationale TEXT,
  ADD COLUMN IF NOT EXISTS mitigation_budget_currency TEXT NOT NULL DEFAULT 'NGN';
INSERT INTO public._onprem_migrations(filename) VALUES ('20260423093956_098286e8-7aff-43fb-9f9b-7b93ab7b84a0.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423095922_6a26003c-759b-466a-9396-1193af07edc1.sql
-- =====================================================================

-- Configurable mapping of treatment strategies → auto-set risk status on submission
CREATE TABLE IF NOT EXISTS public.treatment_strategy_status_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  treatment_strategy TEXT NOT NULL UNIQUE,
  target_status public.risk_status NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_strategy_status_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view strategy status map"
ON public.treatment_strategy_status_map
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins manage strategy status map"
ON public.treatment_strategy_status_map
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role));

CREATE TRIGGER update_treatment_strategy_status_map_updated_at
BEFORE UPDATE ON public.treatment_strategy_status_map
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults (only valid risk_status enum values)
INSERT INTO public.treatment_strategy_status_map (treatment_strategy, target_status, description) VALUES
  ('Mitigate', 'In Review', 'Active treatment in progress; awaiting validation'),
  ('Avoid', 'In Review', 'Risk avoidance plan being executed'),
  ('Transfer', 'In Review', 'Risk transferred via insurance/outsourcing; under monitoring'),
  ('Accept', 'New', 'Risk accepted; tracked without active treatment')
ON CONFLICT (treatment_strategy) DO NOTHING;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260423095922_6a26003c-759b-466a-9396-1193af07edc1.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423103116_2235580f-8820-4533-a716-19d0bab13907.sql
-- =====================================================================
-- Expand SELECT visibility on risks for executive / oversight roles
DROP POLICY IF EXISTS "Authorized users can view risks" ON public.risks;
CREATE POLICY "Authorized users can view risks"
ON public.risks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY[
        'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
        'RMD'::user_role, 'CRO'::user_role, 'EC'::user_role,
        'ERMSC'::user_role, 'RCB'::user_role, 'SUPERVISOR'::user_role,
        'ADMIN'::user_role
      ])
  )
);

-- Expand SELECT on risk_audit_logs for the same roles
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.risk_audit_logs;
CREATE POLICY "Authorized users can view audit logs"
ON public.risk_audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY[
        'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
        'RMD'::user_role, 'CRO'::user_role, 'EC'::user_role,
        'ERMSC'::user_role, 'RCB'::user_role, 'SUPERVISOR'::user_role,
        'ADMIN'::user_role
      ])
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260423103116_2235580f-8820-4533-a716-19d0bab13907.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423111135_9773d152-6899-4479-bfbd-921e17725164.sql
-- =====================================================================
-- Enable RLS and add policies for treatment_strategy_status_map
ALTER TABLE public.treatment_strategy_status_map ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read mappings (needed by risk wizard for all submitters)
CREATE POLICY "Authenticated users can view strategy mappings"
ON public.treatment_strategy_status_map
FOR SELECT
TO authenticated
USING (true);

-- Only ADMIN, RMD, CRO can manage mappings
CREATE POLICY "Admins can insert strategy mappings"
ON public.treatment_strategy_status_map
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
);

CREATE POLICY "Admins can update strategy mappings"
ON public.treatment_strategy_status_map
FOR UPDATE
TO authenticated
USING (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
)
WITH CHECK (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
);

CREATE POLICY "Admins can delete strategy mappings"
ON public.treatment_strategy_status_map
FOR DELETE
TO authenticated
USING (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260423111135_9773d152-6899-4479-bfbd-921e17725164.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423114614_ede7d016-c746-4b84-beec-d6407bb2c569.sql
-- =====================================================================
-- Add risk_type to risk_categories so it can drive both institutional & compliance dropdowns
ALTER TABLE public.risk_categories
  ADD COLUMN IF NOT EXISTS risk_type public.risk_type NOT NULL DEFAULT 'institutional';

-- Backfill existing rows (Strategic, Operational, etc. are institutional — already default)
-- Seed the four compliance categories if they don't already exist
INSERT INTO public.risk_categories (name, description, color, display_order, is_active, risk_type)
SELECT v.name, v.description, v.color, v.display_order, true, 'compliance'::public.risk_type
FROM (VALUES
  ('Registration',         'Taxpayer registration compliance risk',  '#0EA5E9', 101),
  ('Filing',               'Tax return filing compliance risk',      '#6366F1', 102),
  ('Disclosure/Reporting', 'Disclosure and reporting compliance risk','#8B5CF6', 103),
  ('Payment',              'Tax payment compliance risk',            '#10B981', 104)
) AS v(name, description, color, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.risk_categories rc WHERE rc.name = v.name
);

-- For any pre-existing row whose name matches a compliance value, fix its type
UPDATE public.risk_categories
SET risk_type = 'compliance'
WHERE name IN ('Registration', 'Filing', 'Disclosure/Reporting', 'Payment')
  AND risk_type <> 'compliance';
INSERT INTO public._onprem_migrations(filename) VALUES ('20260423114614_ede7d016-c746-4b84-beec-d6407bb2c569.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423115210_94c1bafd-96d0-4b0f-acfb-6a8e655554de.sql
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_strategy_status_map TO authenticated;
GRANT SELECT ON public.treatment_strategy_status_map TO anon;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260423115210_94c1bafd-96d0-4b0f-acfb-6a8e655554de.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423115435_a6dfa066-ef28-4a29-9ddb-298678205da7.sql
-- =====================================================================
GRANT SELECT ON public.risk_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.risk_categories TO authenticated;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260423115435_a6dfa066-ef28-4a29-9ddb-298678205da7.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423141802_9c40a3bf-7d6a-4d46-84b3-b39d443bd154.sql
-- =====================================================================

-- 1. Add pre_submission_status to risks
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS pre_submission_status public.risk_status NULL;

-- 2. Atomic workflow transition RPC
CREATE OR REPLACE FUNCTION public.apply_workflow_transition(
  p_risk_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_risk RECORD;
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_next_status public.risk_status;
  v_next_approval public.approval_status;
  v_log_action text := p_action;
  v_now timestamptz := now();
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_risk FROM public.risks WHERE id = p_risk_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk not found';
  END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE user_id = v_actor;

  IF p_action = 'submit' THEN
    IF v_risk.approval_status NOT IN ('Draft','Returned') THEN
      RAISE EXCEPTION 'Cannot submit from %', v_risk.approval_status;
    END IF;
    v_next_status := 'Submitted'::public.risk_status;
    v_next_approval := 'Submitted'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      pre_submission_status = COALESCE(pre_submission_status, v_risk.status),
      submitted_at = v_now,
      submitted_by = v_actor,
      returned_at = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;

  ELSIF p_action = 'review' THEN
    IF v_risk.approval_status <> 'Submitted' THEN
      RAISE EXCEPTION 'Risk is not awaiting review (current: %)', v_risk.approval_status;
    END IF;
    v_next_status := 'In Review'::public.risk_status;
    v_next_approval := 'Under Review'::public.approval_status;
    -- Claim-lock: only succeed if no one has claimed yet
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      current_reviewer_id = v_actor,
      updated_at = v_now
    WHERE id = p_risk_id
      AND (current_reviewer_id IS NULL OR current_reviewer_id = v_actor);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'CLAIM_CONFLICT: This risk has already been claimed by another reviewer';
    END IF;
    v_log_action := 'reviewed';

  ELSIF p_action = 'approve' THEN
    IF v_risk.approval_status NOT IN ('Submitted','Under Review') THEN
      RAISE EXCEPTION 'Cannot approve from %', v_risk.approval_status;
    END IF;
    v_next_status := 'Approved'::public.risk_status;
    v_next_approval := 'Approved'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      approved_at = v_now,
      approved_by = v_actor,
      pre_submission_status = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'approved';

  ELSIF p_action IN ('return','reject') THEN
    IF v_risk.approval_status NOT IN ('Submitted','Under Review') THEN
      RAISE EXCEPTION 'Cannot return from %', v_risk.approval_status;
    END IF;
    -- Restore pre-submission lifecycle if available, else Draft
    v_next_status := COALESCE(v_risk.pre_submission_status, 'Draft'::public.risk_status);
    v_next_approval := 'Returned'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      returned_at = v_now,
      returned_by = v_actor,
      last_review_comment = p_reason,
      current_reviewer_id = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'returned';

  ELSIF p_action = 'withdraw' THEN
    IF v_risk.approval_status <> 'Submitted' THEN
      RAISE EXCEPTION 'Can only withdraw a Submitted risk';
    END IF;
    IF v_risk.current_reviewer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot withdraw — a reviewer has already claimed this risk';
    END IF;
    IF v_risk.submitted_by IS DISTINCT FROM v_actor AND v_risk.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Only the submitter or author can withdraw';
    END IF;
    v_next_status := COALESCE(v_risk.pre_submission_status, 'Draft'::public.risk_status);
    v_next_approval := 'Draft'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      submitted_at = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'withdrawn';

  ELSIF p_action = 'escalate' THEN
    IF v_risk.approval_status IN ('Approved') THEN
      RAISE EXCEPTION 'Cannot escalate an approved risk';
    END IF;
    v_next_status := 'Escalated'::public.risk_status;
    v_next_approval := 'Under Review'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'escalated';

  ELSIF p_action = 'deescalate' THEN
    IF v_actor_role NOT IN ('ADMIN','CRO','RMD') THEN
      RAISE EXCEPTION 'Only ADMIN, CRO or RMD can de-escalate';
    END IF;
    IF v_risk.status <> 'Escalated' THEN
      RAISE EXCEPTION 'Risk is not escalated';
    END IF;
    v_next_status := COALESCE(v_risk.pre_submission_status, 'In Review'::public.risk_status);
    v_next_approval := 'Under Review'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'deescalated';

  ELSE
    RAISE EXCEPTION 'Unknown workflow action: %', p_action;
  END IF;

  -- Atomic history log
  INSERT INTO public.approval_history (
    risk_id, action, from_status, to_status, actor_id, actor_role, comments, metadata
  ) VALUES (
    p_risk_id, v_log_action, v_risk.approval_status, v_next_approval, v_actor, v_actor_role, p_reason, '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'status', v_next_status,
    'approval_status', v_next_approval,
    'action', v_log_action
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_workflow_transition(uuid, text, text) TO authenticated;

-- 3. Approval inbox helper RPC
CREATE OR REPLACE FUNCTION public.get_approval_inbox()
RETURNS TABLE(
  id uuid,
  risk_reference text,
  title text,
  category public.risk_category,
  risk_type public.risk_type,
  department text,
  residual_score int,
  status public.risk_status,
  approval_status public.approval_status,
  submitted_at timestamptz,
  returned_at timestamptz,
  age_days numeric,
  submitter_name text,
  reviewer_id uuid,
  reviewer_name text,
  bucket text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.user_role;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE user_id = v_user;

  RETURN QUERY
  SELECT
    r.id,
    r.risk_reference,
    r.title,
    r.category,
    r.risk_type,
    r.department,
    (COALESCE(r.residual_likelihood,0) * COALESCE(r.residual_impact,0))::int AS residual_score,
    r.status,
    r.approval_status,
    r.submitted_at,
    r.returned_at,
    EXTRACT(EPOCH FROM (now() - COALESCE(r.returned_at, r.submitted_at, r.updated_at)))/86400 AS age_days,
    sp.full_name AS submitter_name,
    r.current_reviewer_id AS reviewer_id,
    rp.full_name AS reviewer_name,
    CASE
      WHEN r.approval_status = 'Returned'
        AND (r.submitted_by = v_user OR r.created_by = v_user) THEN 'returned_to_me'
      WHEN r.approval_status = 'Under Review'
        AND r.current_reviewer_id = v_user THEN 'reviewing'
      WHEN r.approval_status = 'Submitted'
        AND v_role = ANY(ARRAY['SUPERVISOR','CRO','RMD','ADMIN']::public.user_role[]) THEN 'awaiting_approval'
      WHEN r.approval_status = 'Under Review'
        AND v_role = ANY(ARRAY['SUPERVISOR','CRO','RMD','ADMIN']::public.user_role[]) THEN 'awaiting_approval'
      WHEN r.approval_status = 'Submitted'
        AND v_role = ANY(ARRAY['RR','RMD','CRO','ADMIN']::public.user_role[]) THEN 'awaiting_review'
      ELSE NULL
    END AS bucket
  FROM public.risks r
  LEFT JOIN public.profiles sp ON sp.user_id = r.submitted_by
  LEFT JOIN public.profiles rp ON rp.user_id = r.current_reviewer_id
  WHERE
    (r.approval_status = 'Returned' AND (r.submitted_by = v_user OR r.created_by = v_user))
    OR (r.approval_status = 'Under Review' AND r.current_reviewer_id = v_user)
    OR (r.approval_status IN ('Submitted','Under Review')
        AND v_role = ANY(ARRAY['SUPERVISOR','CRO','RMD','ADMIN']::public.user_role[]))
    OR (r.approval_status = 'Submitted'
        AND v_role = ANY(ARRAY['RR','RMD','CRO','ADMIN']::public.user_role[]))
  ORDER BY COALESCE(r.returned_at, r.submitted_at, r.updated_at) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_approval_inbox() TO authenticated;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260423141802_9c40a3bf-7d6a-4d46-84b3-b39d443bd154.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260423162454_34878ca2-de4f-4a8b-986d-4f99a710f15a.sql
-- =====================================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
  CHECK (category = ANY (ARRAY['risk_update','bcp_change','document_upload','system','user_action','approval']::text[]));
INSERT INTO public._onprem_migrations(filename) VALUES ('20260423162454_34878ca2-de4f-4a8b-986d-4f99a710f15a.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260425143236_d672e8f1-6bc3-4d81-a566-bc3d4074ece1.sql
-- =====================================================================
-- Temporarily disable audit trigger on risks since this is a system-level normalization
ALTER TABLE public.risks DISABLE TRIGGER USER;

UPDATE public.risks
SET taxpayer_segment = CASE
  WHEN taxpayer_segment IN ('Large', 'Large Taxpayer', 'Large Taxpayers', 'LTO') THEN 'Large Taxpayers'
  WHEN taxpayer_segment IN ('Medium', 'Medium Taxpayer', 'Medium Taxpayers', 'MTO', 'SME') THEN 'Medium Taxpayers'
  WHEN taxpayer_segment IN ('Emerging', 'Emerging Taxpayer', 'Emerging Taxpayers', 'Small Taxpayer', 'Small Taxpayers') THEN 'Emerging Taxpayers'
  WHEN taxpayer_segment IN ('All', 'all', '') THEN NULL
  ELSE taxpayer_segment
END
WHERE taxpayer_segment IS NOT NULL;

ALTER TABLE public.risks ENABLE TRIGGER USER;

UPDATE public.risk_appetite_config
SET taxpayer_segment = CASE
  WHEN taxpayer_segment IN ('Large', 'Large Taxpayer', 'Large Taxpayers', 'LTO') THEN 'Large Taxpayers'
  WHEN taxpayer_segment IN ('Medium', 'Medium Taxpayer', 'Medium Taxpayers', 'MTO', 'SME') THEN 'Medium Taxpayers'
  WHEN taxpayer_segment IN ('Emerging', 'Emerging Taxpayer', 'Emerging Taxpayers', 'Small Taxpayer', 'Small Taxpayers') THEN 'Emerging Taxpayers'
  WHEN taxpayer_segment IN ('All', 'all', '') THEN NULL
  ELSE taxpayer_segment
END
WHERE taxpayer_segment IS NOT NULL;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260425143236_d672e8f1-6bc3-4d81-a566-bc3d4074ece1.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260425144921_3b714e4a-97d4-41b8-bc0c-d56ad9771741.sql
-- =====================================================================
-- Broaden SELECT on risk_events: any authenticated user can view incidents
DROP POLICY IF EXISTS "Authorized view risk events" ON public.risk_events;
CREATE POLICY "All authenticated can view risk events"
  ON public.risk_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Broaden manage policy to include CRO/SUPERVISOR/RR who often log/triage incidents
DROP POLICY IF EXISTS "Authorized manage risk events" ON public.risk_events;
CREATE POLICY "Authorized manage risk events"
  ON public.risk_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
    )
  );
INSERT INTO public._onprem_migrations(filename) VALUES ('20260425144921_3b714e4a-97d4-41b8-bc0c-d56ad9771741.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260425162659_79bd7925-e948-4a74-af2d-b49c2b10a776.sql
-- =====================================================================
-- Audit trigger for risk_events (incidents): log create/update/delete to system_audit_logs
CREATE OR REPLACE FUNCTION public.log_risk_event_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_severity text := 'low';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(auth.uid(), NEW.reported_by),
      'incident_created',
      'data_modification',
      'incident',
      NEW.id,
      jsonb_build_object(
        'reference_number', NEW.reference_number,
        'title', NEW.title,
        'severity', NEW.severity,
        'status', NEW.status
      ),
      'medium'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- compute diff over a curated whitelist of fields
    FOR v_key IN SELECT unnest(ARRAY[
      'title','status','severity','risk_posture','event_date','discovered_date','resolution_date',
      'financial_impact','event_description','root_cause','immediate_response','operational_impact',
      'reputational_impact','lessons_learned','impact_amount','impact_description','resolution_notes'
    ]) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key));
      END IF;
    END LOOP;

    IF v_changes <> '{}'::jsonb THEN
      IF (v_changes ? 'status') OR (v_changes ? 'severity') THEN
        v_severity := 'high';
      ELSE
        v_severity := 'medium';
      END IF;
      PERFORM public.log_system_audit(
        auth.uid(),
        'incident_updated',
        'data_modification',
        'incident',
        NEW.id,
        jsonb_build_object(
          'reference_number', NEW.reference_number,
          'title', NEW.title,
          'changes', v_changes
        ),
        v_severity
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'incident_deleted',
      'data_modification',
      'incident',
      OLD.id,
      jsonb_build_object('reference_number', OLD.reference_number, 'title', OLD.title),
      'high'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_risk_events_audit ON public.risk_events;
CREATE TRIGGER trg_risk_events_audit
AFTER INSERT OR UPDATE OR DELETE ON public.risk_events
FOR EACH ROW EXECUTE FUNCTION public.log_risk_event_audit();

-- Allow authorized roles to read incident audit entries from system_audit_logs
DROP POLICY IF EXISTS "Authorized view incident audit logs" ON public.system_audit_logs;
CREATE POLICY "Authorized view incident audit logs"
ON public.system_audit_logs
FOR SELECT
TO authenticated
USING (
  resource_type = 'incident'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN','EC','ERMSC','RCB']::user_role[])
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260425162659_79bd7925-e948-4a74-af2d-b49c2b10a776.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260427085905_61646ae2-e5e4-4192-ab0f-9683a5faf7e4.sql
-- =====================================================================
-- 1. Create risk_mitigation_tasks table
CREATE TABLE IF NOT EXISTS public.risk_mitigation_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  evidence_notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_mitigation_tasks_risk_id ON public.risk_mitigation_tasks(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_mitigation_tasks_assigned_to ON public.risk_mitigation_tasks(assigned_to);

ALTER TABLE public.risk_mitigation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized view mitigation tasks"
  ON public.risk_mitigation_tasks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

CREATE POLICY "Authorized manage mitigation tasks"
  ON public.risk_mitigation_tasks FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

CREATE TRIGGER update_risk_mitigation_tasks_updated_at
  BEFORE UPDATE ON public.risk_mitigation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Update risk_assessments policy to include RR (Risk Reviewer)
DROP POLICY IF EXISTS "Authorized manage assessments" ON public.risk_assessments;
CREATE POLICY "Authorized manage assessments"
  ON public.risk_assessments FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

-- 3. Update risk_controls policy to include RR (Risk Reviewer)
DROP POLICY IF EXISTS "Authorized manage controls" ON public.risk_controls;
CREATE POLICY "Authorized manage controls"
  ON public.risk_controls FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));
INSERT INTO public._onprem_migrations(filename) VALUES ('20260427085905_61646ae2-e5e4-4192-ab0f-9683a5faf7e4.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260428103426_28f4de4d-c985-40a0-ab9c-ce9236b91fe1.sql
-- =====================================================================
-- Allow RMD and CRO (in addition to ADMIN) to manage risk appetite configuration.
DROP POLICY IF EXISTS "Admins manage appetite config" ON public.risk_appetite_config;

CREATE POLICY "Risk leaders manage appetite config"
ON public.risk_appetite_config
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260428103426_28f4de4d-c985-40a0-ab9c-ce9236b91fe1.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429063838_d3f6e81f-67da-400e-896a-8d2b40c32cf9.sql
-- =====================================================================
-- Add updated_by tracking to forum_discussions and forum_posts; add is_locked to forum_posts
ALTER TABLE public.forum_discussions
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- Trigger to maintain updated_by / updated_at on edits
CREATE OR REPLACE FUNCTION public.set_forum_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_discussions_updated_meta ON public.forum_discussions;
CREATE TRIGGER trg_forum_discussions_updated_meta
BEFORE UPDATE ON public.forum_discussions
FOR EACH ROW
EXECUTE FUNCTION public.set_forum_updated_meta();

DROP TRIGGER IF EXISTS trg_forum_posts_updated_meta ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_updated_meta
BEFORE UPDATE ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_forum_updated_meta();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429063838_d3f6e81f-67da-400e-896a-8d2b40c32cf9.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429095539_545c69ed-d838-476c-afe6-3c441fea0377.sql
-- =====================================================================
-- Create private storage bucket for control documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('control-documents', 'control-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read control document files (file metadata + signed URLs gate downloads)
CREATE POLICY "Authenticated can read control documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'control-documents');

-- RMD/CRO/ADMIN can upload/update/delete control document files
CREATE POLICY "Managers can upload control documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'control-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
  )
);

CREATE POLICY "Managers can update control documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
  )
);

CREATE POLICY "Managers can delete control documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD'::user_role, 'ADMIN'::user_role])
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429095539_545c69ed-d838-476c-afe6-3c441fea0377.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429101808_694d5ff9-a595-42ca-9c88-933ff38c3104.sql
-- =====================================================================
-- Create public 'avatars' storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, users manage their own folder (folder = user_id)
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Audit trigger for profile updates (full_name, avatar_url, department)
CREATE OR REPLACE FUNCTION public.log_profile_update_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('from', OLD.full_name, 'to', NEW.full_name));
  END IF;
  IF OLD.department IS DISTINCT FROM NEW.department THEN
    v_changes := v_changes || jsonb_build_object('department', jsonb_build_object('from', OLD.department, 'to', NEW.department));
  END IF;
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
    v_changes := v_changes || jsonb_build_object('avatar_url', jsonb_build_object('from', OLD.avatar_url, 'to', NEW.avatar_url));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'profile_updated',
      'data_modification',
      'profile',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'target_email', NEW.email,
        'changes', v_changes
      ),
      'low'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_update_audit ON public.profiles;
CREATE TRIGGER trg_log_profile_update_audit
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_update_audit();

-- RPC for users to log their own password change events to system_audit_logs
CREATE OR REPLACE FUNCTION public.log_password_change_event()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_user;
  v_id := public.log_system_audit(
    v_user,
    'password_changed',
    'authentication',
    'profile',
    NULL,
    jsonb_build_object('email', v_email, 'self_service', true),
    'medium'
  );
  RETURN v_id;
END;
$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429101808_694d5ff9-a595-42ca-9c88-933ff38c3104.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429102238_0e086f43-737a-4643-bada-32ce92f1e63c.sql
-- =====================================================================
-- Prevent non-admins from changing the 'department' field on profiles
CREATE OR REPLACE FUNCTION public.enforce_profile_department_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.department IS DISTINCT FROM NEW.department THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::public.user_role
    ) INTO v_is_admin;

    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Only administrators can change the department field'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_department_admin_only ON public.profiles;
CREATE TRIGGER trg_enforce_profile_department_admin_only
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_department_admin_only();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429102238_0e086f43-737a-4643-bada-32ce92f1e63c.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429102904_397e329f-b930-45a5-94a1-93463e714777.sql
-- =====================================================================
-- Allow ADMIN, RMD, CRO to manage risk_appetite_config based on either profiles.role or user_roles
DROP POLICY IF EXISTS "Risk leaders manage appetite config" ON public.risk_appetite_config;

CREATE POLICY "Risk leaders manage appetite config"
ON public.risk_appetite_config
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429102904_397e329f-b930-45a5-94a1-93463e714777.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429104217_ae8c88bf-369c-4208-8e0a-86a2503c0cc1.sql
-- =====================================================================
-- Tighten RLS on risk_categories: explicit per-command admin-only policies for write ops
DROP POLICY IF EXISTS "Admins can manage risk categories" ON public.risk_categories;

CREATE POLICY "Admins can insert risk categories"
ON public.risk_categories
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

CREATE POLICY "Admins can update risk categories"
ON public.risk_categories
FOR UPDATE
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role))
WITH CHECK (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

CREATE POLICY "Admins can delete risk categories"
ON public.risk_categories
FOR DELETE
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

-- Also let admins view inactive categories (existing SELECT policy only shows active)
CREATE POLICY "Admins can view all risk categories"
ON public.risk_categories
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

-- Block deletion of categories referenced by any existing risk.
-- risks.category is an enum stored as text; match by category name.
CREATE OR REPLACE FUNCTION public.prevent_risk_category_delete_if_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.risks r
  WHERE r.category::text = OLD.name
    AND r.risk_type = OLD.risk_type;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete risk category "%" — it is referenced by % existing risk(s). Disable it instead.',
      OLD.name, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_risk_category_delete_if_in_use ON public.risk_categories;
CREATE TRIGGER trg_prevent_risk_category_delete_if_in_use
BEFORE DELETE ON public.risk_categories
FOR EACH ROW
EXECUTE FUNCTION public.prevent_risk_category_delete_if_in_use();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429104217_ae8c88bf-369c-4208-8e0a-86a2503c0cc1.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429104552_c9d2e255-94cf-4546-8feb-490cee96416a.sql
-- =====================================================================
-- Audit log for risk_categories changes (incl. blocked deletes)
CREATE TABLE IF NOT EXISTS public.risk_category_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid,
  category_name text,
  risk_type public.risk_type,
  action text NOT NULL, -- created | updated | deleted | delete_blocked
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  changes jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.risk_category_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view risk category audit logs"
ON public.risk_category_audit_logs
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

CREATE POLICY "System inserts risk category audit logs"
ON public.risk_category_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Trigger function: log insert/update/delete
CREATE OR REPLACE FUNCTION public.log_risk_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.risk_category_audit_logs (category_id, category_name, risk_type, action, performed_by, changes)
    VALUES (NEW.id, NEW.name, NEW.risk_type, 'created', auth.uid(),
      jsonb_build_object('after', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.risk_category_audit_logs (category_id, category_name, risk_type, action, performed_by, changes)
    VALUES (NEW.id, NEW.name, NEW.risk_type, 'updated', auth.uid(),
      jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.risk_category_audit_logs (category_id, category_name, risk_type, action, performed_by, changes)
    VALUES (OLD.id, OLD.name, OLD.risk_type, 'deleted', auth.uid(),
      jsonb_build_object('before', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_risk_category_change ON public.risk_categories;
CREATE TRIGGER trg_log_risk_category_change
AFTER INSERT OR UPDATE OR DELETE ON public.risk_categories
FOR EACH ROW EXECUTE FUNCTION public.log_risk_category_change();

-- Update the delete-prevention trigger to also log blocked attempts
CREATE OR REPLACE FUNCTION public.prevent_risk_category_delete_if_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.risks r
  WHERE r.category::text = OLD.name
    AND r.risk_type = OLD.risk_type;

  IF v_count > 0 THEN
    INSERT INTO public.risk_category_audit_logs
      (category_id, category_name, risk_type, action, performed_by, reason, changes)
    VALUES
      (OLD.id, OLD.name, OLD.risk_type, 'delete_blocked', auth.uid(),
       format('Referenced by %s existing risk(s)', v_count),
       jsonb_build_object('reference_count', v_count));

    RAISE EXCEPTION
      'Cannot delete risk category "%" — it is referenced by % existing risk(s). Disable it instead.',
      OLD.name, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

-- Usage precheck RPC
CREATE OR REPLACE FUNCTION public.risk_category_usage(p_category_id uuid)
RETURNS TABLE(
  category_id uuid,
  category_name text,
  risk_type public.risk_type,
  reference_count integer,
  is_in_use boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat record;
  v_count integer;
BEGIN
  SELECT id, name, risk_type INTO v_cat
  FROM public.risk_categories WHERE id = p_category_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.risks r
  WHERE r.category::text = v_cat.name
    AND r.risk_type = v_cat.risk_type;

  RETURN QUERY SELECT v_cat.id, v_cat.name, v_cat.risk_type, v_count, v_count > 0;
END;
$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429104552_c9d2e255-94cf-4546-8feb-490cee96416a.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429105811_28d2bc55-c6a0-401d-a3fa-1b58d63bd778.sql
-- =====================================================================
-- Create risk-attachments storage bucket (private; signed URLs for access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('risk-attachments', 'risk-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read risk attachments
CREATE POLICY "Authenticated can read risk attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'risk-attachments');

-- Authenticated users can upload risk attachments
CREATE POLICY "Authenticated can upload risk attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'risk-attachments' AND auth.uid() IS NOT NULL);

-- Owners (uploader) can update their files
CREATE POLICY "Owners can update their risk attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'risk-attachments' AND owner = auth.uid());

-- Owners can delete their files; admins/RMD/CRO can delete any
CREATE POLICY "Owners and risk leaders can delete risk attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN','RMD','CRO')
    )
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429105811_28d2bc55-c6a0-401d-a3fa-1b58d63bd778.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429110144_da67d2cc-8f67-466f-a697-e90d1aa3a31b.sql
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_mitigation_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_controls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_appetite_config TO authenticated;
GRANT SELECT ON public.risk_mitigation_tasks TO anon;
GRANT SELECT ON public.risk_assessments TO anon;
GRANT SELECT ON public.risk_controls TO anon;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429110144_da67d2cc-8f67-466f-a697-e90d1aa3a31b.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429130022_d67e75f7-23c5-4e07-8c14-36391b238e1d.sql
-- =====================================================================
-- 1) History (audit trail) table
CREATE TABLE IF NOT EXISTS public.risk_mitigation_task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.risk_mitigation_tasks(id) ON DELETE CASCADE,
  risk_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_rmth_task ON public.risk_mitigation_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_rmth_risk ON public.risk_mitigation_task_history(risk_id);

ALTER TABLE public.risk_mitigation_task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized view task history" ON public.risk_mitigation_task_history;
CREATE POLICY "Authorized view task history"
ON public.risk_mitigation_task_history
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['RC'::user_role,'RR'::user_role,'RO'::user_role,'RMD'::user_role,'CRO'::user_role,'SUPERVISOR'::user_role,'ADMIN'::user_role])
));

DROP POLICY IF EXISTS "System insert task history" ON public.risk_mitigation_task_history;
CREATE POLICY "System insert task history"
ON public.risk_mitigation_task_history
FOR INSERT
TO authenticated
WITH CHECK (true);

GRANT SELECT, INSERT ON public.risk_mitigation_task_history TO authenticated;

-- 2) Transition validation + completion metadata trigger (BEFORE UPDATE)
CREATE OR REPLACE FUNCTION public.validate_mitigation_task_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed TEXT[];
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'pending'     THEN ARRAY['pending','in_progress','cancelled']
      WHEN 'in_progress' THEN ARRAY['in_progress','pending','completed','cancelled']
      WHEN 'completed'   THEN ARRAY['completed','in_progress']
      WHEN 'cancelled'   THEN ARRAY['cancelled','pending']
      ELSE ARRAY['pending','in_progress','completed','cancelled']
    END;

    IF NOT (NEW.status = ANY(allowed)) THEN
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
    ELSIF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL;
      NEW.completed_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_mitigation_task_transition ON public.risk_mitigation_tasks;
CREATE TRIGGER trg_validate_mitigation_task_transition
BEFORE UPDATE ON public.risk_mitigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_mitigation_task_transition();

-- 3) History + notification trigger (AFTER UPDATE)
CREATE OR REPLACE FUNCTION public.log_mitigation_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notify_user UUID;
  risk_title TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- log history
    INSERT INTO public.risk_mitigation_task_history(task_id, risk_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NEW.risk_id, OLD.status, NEW.status, auth.uid());

    -- look up risk title for nicer messages (best effort)
    BEGIN
      SELECT title INTO risk_title FROM public.risks WHERE id = NEW.risk_id;
    EXCEPTION WHEN OTHERS THEN
      risk_title := NULL;
    END;

    -- notify assignee
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        NEW.assigned_to,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id)
      );
    END IF;

    -- notify risk leadership (RMD/CRO/ADMIN), excluding the actor
    FOR notify_user IN
      SELECT user_id FROM public.profiles
      WHERE role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
        AND user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
        AND user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        notify_user,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mitigation_task_status_change ON public.risk_mitigation_tasks;
CREATE TRIGGER trg_log_mitigation_task_status_change
AFTER UPDATE ON public.risk_mitigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_mitigation_task_status_change();

-- 4) Log initial status on insert too
CREATE OR REPLACE FUNCTION public.log_mitigation_task_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.risk_mitigation_task_history(task_id, risk_id, from_status, to_status, changed_by, note)
  VALUES (NEW.id, NEW.risk_id, NULL, NEW.status, COALESCE(auth.uid(), NEW.created_by), 'Task created');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mitigation_task_insert ON public.risk_mitigation_tasks;
CREATE TRIGGER trg_log_mitigation_task_insert
AFTER INSERT ON public.risk_mitigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_mitigation_task_insert();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429130022_d67e75f7-23c5-4e07-8c14-36391b238e1d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429130955_a97bc7c1-2d4f-43db-9de6-a9588a344fd3.sql
-- =====================================================================
-- Update the status change logger to capture an optional note from a session setting
CREATE OR REPLACE FUNCTION public.log_mitigation_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notify_user UUID;
  risk_title TEXT;
  change_note TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- read optional note set by the client for this transaction
    BEGIN
      change_note := NULLIF(current_setting('app.status_change_note', true), '');
    EXCEPTION WHEN OTHERS THEN
      change_note := NULL;
    END;

    INSERT INTO public.risk_mitigation_task_history(task_id, risk_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, NEW.risk_id, OLD.status, NEW.status, auth.uid(), change_note);

    BEGIN
      SELECT title INTO risk_title FROM public.risks WHERE id = NEW.risk_id;
    EXCEPTION WHEN OTHERS THEN
      risk_title := NULL;
    END;

    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        NEW.assigned_to,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', '') ||
          COALESCE(E'\nNote: ' || change_note, ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id, 'note', change_note)
      );
    END IF;

    FOR notify_user IN
      SELECT user_id FROM public.profiles
      WHERE role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
        AND user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
        AND user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        notify_user,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', '') ||
          COALESCE(E'\nNote: ' || change_note, ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id, 'note', change_note)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- RPC to update a mitigation task status with an optional note, captured by the trigger
CREATE OR REPLACE FUNCTION public.update_mitigation_task_status(
  _task_id UUID,
  _new_status TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Set transaction-local note so the AFTER UPDATE trigger can record it
  PERFORM set_config('app.status_change_note', COALESCE(_note, ''), true);

  UPDATE public.risk_mitigation_tasks
  SET status = _new_status
  WHERE id = _task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_mitigation_task_status(UUID, TEXT, TEXT) TO authenticated;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429130955_a97bc7c1-2d4f-43db-9de6-a9588a344fd3.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429131624_4757dca4-6fa0-4c09-bcf4-fb2199c8843d.sql
-- =====================================================================
-- Create risk_attachments table for documents & evidence
CREATE TABLE IF NOT EXISTS public.risk_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  attachment_type TEXT NOT NULL DEFAULT 'evidence',
  description TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_attachments_risk_id ON public.risk_attachments(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_attachments_uploaded_by ON public.risk_attachments(uploaded_by);

ALTER TABLE public.risk_attachments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view attachments
CREATE POLICY "Authenticated can view risk attachments"
ON public.risk_attachments FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert; uploader must be themselves
CREATE POLICY "Authenticated can upload risk attachments"
ON public.risk_attachments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

-- Uploader can update their own attachment metadata
CREATE POLICY "Uploader can update own attachment"
ON public.risk_attachments FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid())
WITH CHECK (uploaded_by = auth.uid());

-- Uploader OR ADMIN/RMD/CRO can delete
CREATE POLICY "Uploader or risk leaders can delete attachments"
ON public.risk_attachments FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['ADMIN'::user_role,'RMD'::user_role,'CRO'::user_role])
  )
);

-- Updated-at trigger
CREATE TRIGGER trg_risk_attachments_updated_at
BEFORE UPDATE ON public.risk_attachments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429131624_4757dca4-6fa0-4c09-bcf4-fb2199c8843d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429132044_a2ce3452-8eb0-4b25-969e-fdc68e9aef73.sql
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_attachments TO authenticated;
GRANT SELECT ON public.risk_attachments TO anon;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429132044_a2ce3452-8eb0-4b25-969e-fdc68e9aef73.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429132328_b7bf8205-8400-4feb-97c8-af18ef1bc06a.sql
-- =====================================================================
-- 1. Security-definer helper: can the current user access this risk?
CREATE OR REPLACE FUNCTION public.can_access_risk(_risk_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.risks r
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE r.id = _risk_id
      AND p.role = ANY (ARRAY[
        'RC'::user_role,'RR'::user_role,'RO'::user_role,
        'RMD'::user_role,'CRO'::user_role,'EC'::user_role,
        'ERMSC'::user_role,'RCB'::user_role,
        'SUPERVISOR'::user_role,'ADMIN'::user_role
      ])
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_risk(uuid) TO authenticated, anon;

-- 2. Replace risk_attachments policies with access-aware ones
DROP POLICY IF EXISTS "Authenticated can view risk attachments" ON public.risk_attachments;
DROP POLICY IF EXISTS "Authenticated can upload risk attachments" ON public.risk_attachments;
DROP POLICY IF EXISTS "Uploader can update own attachment" ON public.risk_attachments;
DROP POLICY IF EXISTS "Uploader or risk leaders can delete attachments" ON public.risk_attachments;

CREATE POLICY "View attachments for accessible risks"
ON public.risk_attachments FOR SELECT
TO authenticated
USING (public.can_access_risk(risk_id));

CREATE POLICY "Upload attachments to accessible risks"
ON public.risk_attachments FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.can_access_risk(risk_id)
);

CREATE POLICY "Uploader can update own attachment"
ON public.risk_attachments FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid() AND public.can_access_risk(risk_id))
WITH CHECK (uploaded_by = auth.uid() AND public.can_access_risk(risk_id));

CREATE POLICY "Uploader or risk leaders can delete attachments"
ON public.risk_attachments FOR DELETE
TO authenticated
USING (
  public.can_access_risk(risk_id)
  AND (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['ADMIN'::user_role,'RMD'::user_role,'CRO'::user_role])
    )
  )
);

-- 3. Tighten storage policies on the risk-attachments bucket.
-- File paths use the convention "<risk_id>/<uuid>.<ext>", so the first
-- folder is the risk_id we can authorize against.
DROP POLICY IF EXISTS "Authenticated can read risk attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload risk attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners and risk leaders can delete risk attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update their risk attachments" ON storage.objects;

CREATE POLICY "Read risk attachments for accessible risks"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Upload risk attachments for accessible risks"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'risk-attachments'
  AND auth.uid() IS NOT NULL
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Update own risk attachment files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND owner = auth.uid()
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Delete risk attachment files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['ADMIN'::user_role,'RMD'::user_role,'CRO'::user_role])
    )
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429132328_b7bf8205-8400-4feb-97c8-af18ef1bc06a.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429144431_54835c1c-b6a8-42ff-b0e8-59a2f4f2b29f.sql
-- =====================================================================
-- 1. Templates
CREATE TABLE public.assessment_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  risk_type risk_type NOT NULL DEFAULT 'institutional',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default per risk_type
CREATE UNIQUE INDEX assessment_templates_one_default_per_type
  ON public.assessment_templates (risk_type)
  WHERE is_default = true AND is_active = true;

-- 2. Sections
CREATE TABLE public.template_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX template_sections_template_idx ON public.template_sections(template_id, sort_order);

-- 3. Questions
CREATE TABLE public.template_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  help_text TEXT,
  question_type TEXT NOT NULL DEFAULT 'text'
    CHECK (question_type IN ('text','number','single_choice','multi_choice','rating','yes_no')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX template_questions_section_idx ON public.template_questions(section_id, sort_order);

-- 4. Category mapping
CREATE TABLE public.template_category_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  category risk_category NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, category)
);
CREATE INDEX template_category_links_category_idx ON public.template_category_links(category);

-- 5. Extend risk_assessments
ALTER TABLE public.risk_assessments
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.assessment_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 6. Triggers for updated_at
CREATE TRIGGER update_assessment_templates_updated_at
  BEFORE UPDATE ON public.assessment_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_sections_updated_at
  BEFORE UPDATE ON public.template_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_questions_updated_at
  BEFORE UPDATE ON public.template_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. RLS
ALTER TABLE public.assessment_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_category_links ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a template manager?
CREATE OR REPLACE FUNCTION public.is_template_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['ADMIN','RMD','CRO']::user_role[])
  );
$$;

-- Read access: any authenticated user can view active templates and their parts
CREATE POLICY "Authenticated view templates"
  ON public.assessment_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view template sections"
  ON public.template_sections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view template questions"
  ON public.template_questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view template category links"
  ON public.template_category_links FOR SELECT TO authenticated USING (true);

-- Manage access: only ADMIN/RMD/CRO
CREATE POLICY "Managers manage templates"
  ON public.assessment_templates FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());

CREATE POLICY "Managers manage sections"
  ON public.template_sections FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());

CREATE POLICY "Managers manage questions"
  ON public.template_questions FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());

CREATE POLICY "Managers manage category links"
  ON public.template_category_links FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429144431_54835c1c-b6a8-42ff-b0e8-59a2f4f2b29f.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260429224210_413ff119-8d57-47b3-9573-12bfc99e6596.sql
-- =====================================================================
ALTER TABLE public.board_report_archives ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN NOT NULL DEFAULT false;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260429224210_413ff119-8d57-47b3-9573-12bfc99e6596.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430075451_475c32fe-71b6-4121-98e9-562d37399688.sql
-- =====================================================================
ALTER TABLE public.business_continuity_plans
  ADD COLUMN IF NOT EXISTS bia_criticality_rating TEXT,
  ADD COLUMN IF NOT EXISTS bia_financial_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS bia_operational_impact TEXT,
  ADD COLUMN IF NOT EXISTS bia_reputational_impact TEXT,
  ADD COLUMN IF NOT EXISTS bia_regulatory_impact TEXT,
  ADD COLUMN IF NOT EXISTS bia_max_tolerable_downtime INTEGER,
  ADD COLUMN IF NOT EXISTS bia_assessment_date DATE,
  ADD COLUMN IF NOT EXISTS test_type TEXT,
  ADD COLUMN IF NOT EXISTS test_scope TEXT,
  ADD COLUMN IF NOT EXISTS test_results TEXT,
  ADD COLUMN IF NOT EXISTS test_findings JSONB DEFAULT '[]'::jsonb;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430075451_475c32fe-71b6-4121-98e9-562d37399688.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430081103_eaa25ca1-97f2-4ea2-93d6-c111a2eb83d2.sql
-- =====================================================================
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Security, Safety & Health';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Information Security';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Environmental, Social & Governance - ESG';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'TEST';
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430081103_eaa25ca1-97f2-4ea2-93d6-c111a2eb83d2.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430082116_70ea7d82-1a71-4ed2-b54b-7fbaf10ad278.sql
-- =====================================================================
-- 1) Auto-sync risk_categories.name into the risk_category enum
CREATE OR REPLACE FUNCTION public.sync_risk_category_enum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.name IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'risk_category' AND e.enumlabel = NEW.name
    ) INTO v_exists;

    IF NOT v_exists THEN
      EXECUTE format('ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS %L', NEW.name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_risk_category_enum_trg ON public.risk_categories;
CREATE TRIGGER sync_risk_category_enum_trg
AFTER INSERT OR UPDATE OF name ON public.risk_categories
FOR EACH ROW
EXECUTE FUNCTION public.sync_risk_category_enum();

-- 2) RLS: allow RMD/CRO/ADMIN to read all risk_audit_logs (for the new RMD audit view)
ALTER TABLE public.risk_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RMD/CRO/ADMIN can view all risk audit logs" ON public.risk_audit_logs;
CREATE POLICY "RMD/CRO/ADMIN can view all risk audit logs"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::public.user_role[])
  )
);

-- Also let users see audit logs for risks they can already access
DROP POLICY IF EXISTS "Users can view audit logs for accessible risks" ON public.risk_audit_logs;
CREATE POLICY "Users can view audit logs for accessible risks"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (public.can_access_risk(risk_id));
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430082116_70ea7d82-1a71-4ed2-b54b-7fbaf10ad278.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430083152_773f8455-8091-47ce-97d7-b5b0fba032c7.sql
-- =====================================================================
-- 1) Schema check audit table
CREATE TABLE IF NOT EXISTS public.bcp_schema_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by UUID,
  status TEXT NOT NULL CHECK (status IN ('ok','missing_columns','error')),
  missing_columns TEXT[] DEFAULT '{}',
  error_message TEXT,
  client_info JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bcp_schema_check_logs_checked_at
  ON public.bcp_schema_check_logs(checked_at DESC);

ALTER TABLE public.bcp_schema_check_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can insert schema checks" ON public.bcp_schema_check_logs;
CREATE POLICY "Authenticated can insert schema checks"
ON public.bcp_schema_check_logs
FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admin/RMD/CRO can view schema checks" ON public.bcp_schema_check_logs;
CREATE POLICY "Admin/RMD/CRO can view schema checks"
ON public.bcp_schema_check_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN','RMD','CRO']::public.user_role[])
  )
);

-- 2) Server-side validation trigger for BIA / test detail fields
CREATE OR REPLACE FUNCTION public.validate_bcp_bia_test_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criticality rating
  IF NEW.bia_criticality_rating IS NOT NULL
     AND NEW.bia_criticality_rating NOT IN ('Critical','High','Medium','Low') THEN
    RAISE EXCEPTION 'bia_criticality_rating must be one of Critical, High, Medium, Low (got: %)', NEW.bia_criticality_rating
      USING ERRCODE = 'check_violation';
  END IF;

  -- Financial impact: non-negative
  IF NEW.bia_financial_impact IS NOT NULL AND NEW.bia_financial_impact < 0 THEN
    RAISE EXCEPTION 'bia_financial_impact must be zero or positive (got: %)', NEW.bia_financial_impact
      USING ERRCODE = 'check_violation';
  END IF;

  -- MTD: non-negative integer hours, capped at 5 years
  IF NEW.bia_max_tolerable_downtime IS NOT NULL THEN
    IF NEW.bia_max_tolerable_downtime < 0 THEN
      RAISE EXCEPTION 'bia_max_tolerable_downtime must be zero or positive (got: %)', NEW.bia_max_tolerable_downtime
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.bia_max_tolerable_downtime > 43800 THEN
      RAISE EXCEPTION 'bia_max_tolerable_downtime is unreasonably large (got: % hours, max 43800)', NEW.bia_max_tolerable_downtime
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Assessment date cannot be in the future
  IF NEW.bia_assessment_date IS NOT NULL AND NEW.bia_assessment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'bia_assessment_date cannot be in the future (got: %)', NEW.bia_assessment_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Text length sanity
  IF NEW.bia_operational_impact IS NOT NULL AND length(NEW.bia_operational_impact) > 2000 THEN
    RAISE EXCEPTION 'bia_operational_impact exceeds 2000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.bia_reputational_impact IS NOT NULL AND length(NEW.bia_reputational_impact) > 2000 THEN
    RAISE EXCEPTION 'bia_reputational_impact exceeds 2000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.bia_regulatory_impact IS NOT NULL AND length(NEW.bia_regulatory_impact) > 2000 THEN
    RAISE EXCEPTION 'bia_regulatory_impact exceeds 2000 characters' USING ERRCODE = 'check_violation';
  END IF;

  -- Test type: allow null or one of known values
  IF NEW.test_type IS NOT NULL
     AND NEW.test_type NOT IN ('Tabletop Exercise','Walkthrough','Simulation','Full Test') THEN
    RAISE EXCEPTION 'test_type must be one of Tabletop Exercise, Walkthrough, Simulation, Full Test (got: %)', NEW.test_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.test_scope IS NOT NULL AND length(NEW.test_scope) > 1000 THEN
    RAISE EXCEPTION 'test_scope exceeds 1000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.test_results IS NOT NULL AND length(NEW.test_results) > 4000 THEN
    RAISE EXCEPTION 'test_results exceeds 4000 characters' USING ERRCODE = 'check_violation';
  END IF;

  -- test_findings must be a JSON array
  IF NEW.test_findings IS NOT NULL AND jsonb_typeof(NEW.test_findings) <> 'array' THEN
    RAISE EXCEPTION 'test_findings must be a JSON array' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_bcp_bia_test_fields_trg ON public.business_continuity_plans;
CREATE TRIGGER validate_bcp_bia_test_fields_trg
BEFORE INSERT OR UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.validate_bcp_bia_test_fields();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430083152_773f8455-8091-47ce-97d7-b5b0fba032c7.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430084151_7c60a00a-3e3a-418f-ba42-991241041a01.sql
-- =====================================================================
-- BCP version history table for BIA / test detail edits
CREATE TABLE IF NOT EXISTS public.bcp_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bcp_id UUID NOT NULL REFERENCES public.business_continuity_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','updated')),
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcp_version_history_bcp_id ON public.bcp_version_history(bcp_id);
CREATE INDEX IF NOT EXISTS idx_bcp_version_history_performed_at ON public.bcp_version_history(performed_at DESC);

ALTER TABLE public.bcp_version_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/RMD/CRO view all BCP version history" ON public.bcp_version_history;
CREATE POLICY "Admin/RMD/CRO view all BCP version history"
ON public.bcp_version_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN','RMD','CRO']::public.user_role[])
  )
);

DROP POLICY IF EXISTS "Owners view their BCP version history" ON public.bcp_version_history;
CREATE POLICY "Owners view their BCP version history"
ON public.bcp_version_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_continuity_plans b
    WHERE b.id = bcp_version_history.bcp_id
      AND (b.owner_id = auth.uid() OR b.created_by = auth.uid())
  )
);

-- Trigger function that snapshots BIA / test fields on every change
CREATE OR REPLACE FUNCTION public.record_bcp_version_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tracked TEXT[] := ARRAY[
    'bia_criticality_rating',
    'bia_financial_impact',
    'bia_operational_impact',
    'bia_reputational_impact',
    'bia_regulatory_impact',
    'bia_max_tolerable_downtime',
    'bia_assessment_date',
    'test_type',
    'test_scope',
    'test_results',
    'test_findings'
  ];
  before_jsonb JSONB := '{}'::jsonb;
  after_jsonb  JSONB := '{}'::jsonb;
  changed TEXT[] := ARRAY[]::TEXT[];
  k TEXT;
  v_before JSONB;
  v_after  JSONB;
  full_old JSONB;
  full_new JSONB;
BEGIN
  full_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    full_old := to_jsonb(OLD);
  ELSE
    full_old := '{}'::jsonb;
  END IF;

  FOREACH k IN ARRAY tracked LOOP
    v_after  := full_new -> k;
    v_before := CASE WHEN TG_OP = 'UPDATE' THEN full_old -> k ELSE NULL END;
    IF TG_OP = 'INSERT' THEN
      after_jsonb := after_jsonb || jsonb_build_object(k, v_after);
      IF v_after IS NOT NULL AND v_after <> 'null'::jsonb THEN
        changed := array_append(changed, k);
      END IF;
    ELSIF v_before IS DISTINCT FROM v_after THEN
      before_jsonb := before_jsonb || jsonb_build_object(k, v_before);
      after_jsonb  := after_jsonb  || jsonb_build_object(k, v_after);
      changed := array_append(changed, k);
    END IF;
  END LOOP;

  -- Skip pure no-op updates
  IF TG_OP = 'UPDATE' AND array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.bcp_version_history (
    bcp_id, action, changed_fields, before_values, after_values, performed_by
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    changed,
    before_jsonb,
    after_jsonb,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_bcp_version_history_trg ON public.business_continuity_plans;
CREATE TRIGGER record_bcp_version_history_trg
AFTER INSERT OR UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.record_bcp_version_history();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430084151_7c60a00a-3e3a-418f-ba42-991241041a01.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430084833_e6934a94-6cf8-473b-875e-1250a7f66999.sql
-- =====================================================================
-- Allow executive viewer roles (CRO, ERMSC, EC, RCB) and RMD/ADMIN to view all BCPs
-- so the Executive Dashboard's BCP Coverage metric is consistent across roles
-- with view-only access. Department heads keep visibility into their own dept.

DROP POLICY IF EXISTS "RMD and critical dept heads can view all BCPs" ON public.business_continuity_plans;

CREATE POLICY "Executives and dept heads can view BCPs"
ON public.business_continuity_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY[
        'RMD'::user_role,
        'CRO'::user_role,
        'ADMIN'::user_role,
        'ERMSC'::user_role,
        'EC'::user_role,
        'RCB'::user_role
      ])
  )
  OR department = (
    SELECT profiles.department FROM public.profiles
    WHERE profiles.user_id = auth.uid()
  )
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430084833_e6934a94-6cf8-473b-875e-1250a7f66999.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260430085354_f871df16-51aa-47ab-8777-6dcd65596695.sql
-- =====================================================================
-- Extend read access on risk-related tables to executive viewer roles
-- so dashboard widgets show consistent values across CRO, EC, ERMSC, and RCB.

-- 1. risk_assessments
DROP POLICY IF EXISTS "Authorized view assessments" ON public.risk_assessments;
CREATE POLICY "Authorized view assessments"
ON public.risk_assessments
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 2. risk_controls
DROP POLICY IF EXISTS "Authorized view controls" ON public.risk_controls;
CREATE POLICY "Authorized view controls"
ON public.risk_controls
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 3. approval_history
DROP POLICY IF EXISTS "Authorized view approval history" ON public.approval_history;
CREATE POLICY "Authorized view approval history"
ON public.approval_history
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 4. risk_mitigation_tasks
DROP POLICY IF EXISTS "Authorized view mitigation tasks" ON public.risk_mitigation_tasks;
CREATE POLICY "Authorized view mitigation tasks"
ON public.risk_mitigation_tasks
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 5. ai_predictions (add RCB)
DROP POLICY IF EXISTS "Authorized view AI predictions" ON public.ai_predictions;
CREATE POLICY "Authorized view AI predictions"
ON public.ai_predictions
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'EC'::user_role,
      'ERMSC'::user_role, 'RCB'::user_role, 'ADMIN'::user_role,
      'SUPERVISOR'::user_role
    ])
));
INSERT INTO public._onprem_migrations(filename) VALUES ('20260430085354_f871df16-51aa-47ab-8777-6dcd65596695.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260506090355_b4d3dcfa-4f92-4c27-85c1-632834c0ef6d.sql
-- =====================================================================

-- 1. Add lockout flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason text;

-- 2. Failed-attempts ledger (written by app/edge function on failed login)
CREATE TABLE IF NOT EXISTS public.auth_failed_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_failed_attempts_email_time
  ON public.auth_failed_attempts (email, attempted_at DESC);

ALTER TABLE public.auth_failed_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can read; inserts go through service role / edge function
CREATE POLICY "Admins can read failed attempts"
  ON public.auth_failed_attempts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role
  ));

-- 3. Admin RPC to lock/unlock a user
CREATE OR REPLACE FUNCTION public.admin_set_user_locked(
  _user_id uuid,
  _locked boolean,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can lock or unlock accounts'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET is_locked = _locked,
      locked_at = CASE WHEN _locked THEN now() ELSE NULL END,
      locked_reason = CASE WHEN _locked THEN _reason ELSE NULL END
  WHERE user_id = _user_id;

  PERFORM public.log_system_audit(
    auth.uid(),
    CASE WHEN _locked THEN 'account_locked' ELSE 'account_unlocked' END,
    'authentication',
    'profile',
    _user_id,
    jsonb_build_object('reason', _reason),
    'high'
  );
END;
$$;

-- 4. Admin overview view
CREATE OR REPLACE VIEW public.admin_auth_overview
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.email,
  p.full_name,
  p.department,
  p.role,
  p.is_locked,
  p.locked_at,
  p.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  COALESCE(
    (SELECT array_agg(ur.role::text ORDER BY ur.assigned_at)
     FROM public.user_roles ur WHERE ur.user_id = p.user_id),
    ARRAY[]::text[]
  ) AS assigned_roles
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id;

-- Restrict view: only admins can SELECT
REVOKE ALL ON public.admin_auth_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_auth_overview TO authenticated;

-- Wrap with a security-definer function that enforces ADMIN
CREATE OR REPLACE FUNCTION public.get_admin_auth_overview()
RETURNS SETOF public.admin_auth_overview
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_auth_overview;
END;
$$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260506090355_b4d3dcfa-4f92-4c27-85c1-632834c0ef6d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260708211953_bb30bd38-784b-4ede-a035-3a0e2f1f8bf7.sql
-- =====================================================================

-- Only ADMINs can read from the onprem-exports bucket
CREATE POLICY "onprem_exports_admin_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'onprem-exports'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);

-- Only ADMINs can delete (post-import cleanup)
CREATE POLICY "onprem_exports_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'onprem-exports'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260708211953_bb30bd38-784b-4ede-a035-3a0e2f1f8bf7.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724103543_1d149ae9-e00e-4918-947b-a93d9635601d.sql
-- =====================================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'whistleblow_attachments',
    'risk_category_audit_logs',
    'assessment_templates',
    'template_sections',
    'template_questions',
    'template_category_links',
    'bcp_schema_check_logs',
    'bcp_version_history',
    'auth_failed_attempts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724103543_1d149ae9-e00e-4918-947b-a93d9635601d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724103611_278233f4-bdcf-469b-be92-6dc834e214d0.sql
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_category_audit_logs TO authenticated;
GRANT ALL ON public.risk_category_audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_templates TO authenticated;
GRANT ALL ON public.assessment_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_sections TO authenticated;
GRANT ALL ON public.template_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_questions TO authenticated;
GRANT ALL ON public.template_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_category_links TO authenticated;
GRANT ALL ON public.template_category_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bcp_schema_check_logs TO authenticated;
GRANT ALL ON public.bcp_schema_check_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bcp_version_history TO authenticated;
GRANT ALL ON public.bcp_version_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_failed_attempts TO authenticated;
GRANT ALL ON public.auth_failed_attempts TO service_role;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724103611_278233f4-bdcf-469b-be92-6dc834e214d0.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724105920_93eeb6b4-0b62-48ea-b174-6c2696cb76f2.sql
-- =====================================================================

-- 1. GRANTs on critical tables (missing entirely in prod)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_report_archives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risks TO service_role;
GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.board_report_archives TO service_role;
GRANT ALL ON public.risk_events TO service_role;

-- 2. Prevent profile role self-escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.user_has_role(auth.uid(), 'ADMIN'::user_role) THEN
      RAISE EXCEPTION 'Only administrators can change a profile role'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_self_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_role_self_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_self_escalation();

-- 3. backup_logs: restrict UPDATE to admins only
DROP POLICY IF EXISTS "System can update backup logs" ON public.backup_logs;
CREATE POLICY "Admins can update backup logs" ON public.backup_logs
FOR UPDATE TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::user_role))
WITH CHECK (public.user_has_role(auth.uid(), 'ADMIN'::user_role));

-- 4. Remove overly permissive INSERT policies on system log tables.
--    Inserts still succeed because they go through SECURITY DEFINER
--    functions owned by postgres (which bypasses RLS).
DROP POLICY IF EXISTS "System can insert backup logs" ON public.backup_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.system_audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.risk_audit_logs;
DROP POLICY IF EXISTS "System insert risk history" ON public.risk_history;
DROP POLICY IF EXISTS "Authorized insert approval history" ON public.approval_history;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Try common names for the remaining log-table insert policies
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('user_activity_logs','user_login_history','whistleblow_audit_log')
      AND cmd='INSERT'
      AND with_check = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 5. bcp_schema_check_logs: scope insert to self
DROP POLICY IF EXISTS "Authenticated can insert schema checks" ON public.bcp_schema_check_logs;
CREATE POLICY "Users can insert their own schema checks" ON public.bcp_schema_check_logs
FOR INSERT TO authenticated
WITH CHECK (checked_by IS NULL OR checked_by = auth.uid());

-- 6. Function search_path hardening (16 flagged functions)
ALTER FUNCTION public.create_bcp_audit_log()          SET search_path = public;
ALTER FUNCTION public.create_risk_audit_log()         SET search_path = public;
ALTER FUNCTION public.get_backup_status_summary()     SET search_path = public;
ALTER FUNCTION public.get_user_role(uuid)             SET search_path = public;
ALTER FUNCTION public.increment_discussion_views()    SET search_path = public;
ALTER FUNCTION public.log_system_audit(uuid, text, text, text, uuid, jsonb, text) SET search_path = public;
ALTER FUNCTION public.log_user_activity(uuid, text, text, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.notify_bcp_change()             SET search_path = public;
ALTER FUNCTION public.notify_document_upload()        SET search_path = public;
ALTER FUNCTION public.notify_risk_update()            SET search_path = public;
ALTER FUNCTION public.schedule_backup_operation(uuid, text, uuid) SET search_path = public;
ALTER FUNCTION public.send_notification(uuid, text, text, text, text, text, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.update_discussion_stats()       SET search_path = public;
ALTER FUNCTION public.update_updated_at_column()      SET search_path = public;
ALTER FUNCTION public.user_has_role(uuid, user_role)  SET search_path = public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='get_user_roles') THEN
    EXECUTE 'ALTER FUNCTION public.get_user_roles(uuid) SET search_path = public';
  END IF;
END $$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260724105920_93eeb6b4-0b62-48ea-b174-6c2696cb76f2.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724110950_b2a4fcc7-73d1-4671-b1fd-8d5738e7e2e9.sql
-- =====================================================================

-- 1. Storage: control-documents ownership/department check
DROP POLICY IF EXISTS "Authenticated can read control documents" ON storage.objects;

CREATE POLICY "Read control documents by role/owner/department"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.control_documents cd
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE cd.file_url = storage.objects.name
        AND (cd.owner_id = auth.uid() OR cd.department = p.department)
    )
  )
);

-- 2. notification_preferences: replace ALL policy with per-command policies that enforce ownership on writes
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.notification_preferences;

CREATE POLICY "np_select_own" ON public.notification_preferences
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "np_insert_own" ON public.notification_preferences
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "np_update_own" ON public.notification_preferences
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "np_delete_own" ON public.notification_preferences
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. profiles UPDATE: add WITH CHECK (role change still blocked by prevent_profile_role_self_escalation_trg)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. forum_votes: replace ALL policy with per-command ownership-enforced policies
DROP POLICY IF EXISTS "Users can manage their own votes" ON public.forum_votes;

CREATE POLICY "fv_select_own" ON public.forum_votes
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "fv_insert_own" ON public.forum_votes
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fv_update_own" ON public.forum_votes
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fv_delete_own" ON public.forum_votes
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. recovery_checklists: admin ALL policy needs matching WITH CHECK
DROP POLICY IF EXISTS "Admins can manage recovery checklists" ON public.recovery_checklists;

CREATE POLICY "Admins can manage recovery checklists"
ON public.recovery_checklists FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'::user_role
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260724110950_b2a4fcc7-73d1-4671-b1fd-8d5738e7e2e9.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724112447_c90784d3-84a1-48a3-943e-5e56578ce0e6.sql
-- =====================================================================
-- Replace permissive WITH CHECK (true) insert policies with WITH CHECK (false).
-- Rows are written by SECURITY DEFINER triggers/functions (owner bypasses RLS)
-- and by edge functions using the service_role key (bypasses RLS).
-- No legitimate direct client insert path exists for these tables.

DROP POLICY IF EXISTS "System insert task history" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history inserts"
  ON public.risk_mitigation_task_history
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "System inserts risk category audit logs" ON public.risk_category_audit_logs;
CREATE POLICY "Block direct risk category audit inserts"
  ON public.risk_category_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "System insert AI predictions" ON public.ai_predictions;
CREATE POLICY "Block direct AI prediction inserts"
  ON public.ai_predictions
  FOR INSERT TO authenticated
  WITH CHECK (false);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724112447_c90784d3-84a1-48a3-943e-5e56578ce0e6.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724113241_b5638056-a6bd-43af-863c-f6d2199b9b57.sql
-- =====================================================================
-- 1) Profiles: split-column check on UPDATE so self-service updates cannot change role/department/is_locked
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
  AND department IS NOT DISTINCT FROM (SELECT p.department FROM public.profiles p WHERE p.user_id = auth.uid())
  AND is_locked IS NOT DISTINCT FROM (SELECT p.is_locked FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 2) risk_audit_logs: consolidate the three overlapping SELECT policies into two clear, non-overlapping ones
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.risk_audit_logs;
DROP POLICY IF EXISTS "RMD/CRO/ADMIN can view all risk audit logs" ON public.risk_audit_logs;
DROP POLICY IF EXISTS "Users can view audit logs for accessible risks" ON public.risk_audit_logs;

CREATE POLICY "Privileged roles view all risk audit logs"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD','CRO','ADMIN','SUPERVISOR','EC','ERMSC','RCB']::user_role[])
  )
);

CREATE POLICY "Users view audit logs for accessible risks"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (public.can_access_risk(risk_id));
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724113241_b5638056-a6bd-43af-863c-f6d2199b9b57.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724115549_08538f75-32b6-494d-a91e-f7e76a164676.sql
-- =====================================================================
-- =====================================================================
-- Automatic account lockout after N failed logins within a time window.
-- Threshold: 5 failed attempts in 15 minutes -> lock the profile.
-- =====================================================================

-- 1. Record a failed login and auto-lock if threshold exceeded
CREATE OR REPLACE FUNCTION public.record_failed_login(
  _email text,
  _ip    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz := now() - interval '15 minutes';
  v_threshold    int := 5;
  v_attempts     int;
  v_target_user  uuid;
  v_already_locked boolean;
  v_locked_now   boolean := false;
BEGIN
  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RETURN jsonb_build_object('locked', false, 'attempts', 0);
  END IF;

  -- Log the attempt
  INSERT INTO public.auth_failed_attempts(email, ip_address)
  VALUES (lower(trim(_email)), _ip);

  -- Count recent attempts for this email
  SELECT count(*) INTO v_attempts
  FROM public.auth_failed_attempts
  WHERE email = lower(trim(_email))
    AND attempted_at >= v_window_start;

  -- Look up profile (may not exist if email is bogus)
  SELECT user_id, is_locked
    INTO v_target_user, v_already_locked
  FROM public.profiles
  WHERE lower(email) = lower(trim(_email))
  LIMIT 1;

  IF v_attempts >= v_threshold
     AND v_target_user IS NOT NULL
     AND COALESCE(v_already_locked, false) = false THEN

    UPDATE public.profiles
    SET is_locked     = true,
        locked_at     = now(),
        locked_reason = format(
          'Auto-locked after %s failed sign-in attempts within 15 minutes',
          v_attempts
        )
    WHERE user_id = v_target_user;

    v_locked_now := true;

    PERFORM public.log_system_audit(
      v_target_user,
      'account_auto_locked',
      'authentication',
      'profile',
      v_target_user,
      jsonb_build_object(
        'email', lower(trim(_email)),
        'ip_address', _ip,
        'failed_attempts', v_attempts,
        'window_minutes', 15
      ),
      'high'
    );
  END IF;

  RETURN jsonb_build_object(
    'locked',   COALESCE(v_already_locked, false) OR v_locked_now,
    'attempts', v_attempts,
    'threshold', v_threshold
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_failed_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text) TO anon, authenticated, service_role;

-- 2. Cheap lookup used by the sign-in screen before submitting credentials
CREATE OR REPLACE FUNCTION public.is_account_locked(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_locked FROM public.profiles
      WHERE lower(email) = lower(trim(_email)) LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_locked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_account_locked(text) TO anon, authenticated, service_role;

-- 3. Clear the failure ledger on successful sign-in so counters reset
CREATE OR REPLACE FUNCTION public.clear_failed_login_attempts(_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_failed_attempts
  WHERE email = lower(trim(_email));
$$;

REVOKE ALL ON FUNCTION public.clear_failed_login_attempts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_failed_login_attempts(text) TO anon, authenticated, service_role;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724115549_08538f75-32b6-494d-a91e-f7e76a164676.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724121648_3b852db1-ffac-46c3-aec5-d1796460114d.sql
-- =====================================================================
-- 1) Attempt ledger
CREATE TABLE public.whistleblow_submission_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT,
  fingerprint TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_wb_attempts_ip_time ON public.whistleblow_submission_attempts (ip_address, attempted_at DESC);
CREATE INDEX idx_wb_attempts_fp_time ON public.whistleblow_submission_attempts (fingerprint, attempted_at DESC);

-- Service role only (edge function writes; no client access)
GRANT ALL ON public.whistleblow_submission_attempts TO service_role;

ALTER TABLE public.whistleblow_submission_attempts ENABLE ROW LEVEL SECURITY;

-- Deny all client access explicitly; service role bypasses RLS
CREATE POLICY "wb_attempts_no_client_access"
  ON public.whistleblow_submission_attempts
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2) Rate-limit checker (SECURITY DEFINER, callable only by service role)
CREATE OR REPLACE FUNCTION public.check_whistleblow_rate_limit(
  _ip TEXT,
  _fingerprint TEXT,
  _window_minutes INT DEFAULT 10,
  _max_per_ip INT DEFAULT 3,
  _max_per_fingerprint INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - make_interval(mins => _window_minutes);
  v_ip_count INT := 0;
  v_fp_count INT := 0;
BEGIN
  IF _ip IS NOT NULL AND length(trim(_ip)) > 0 THEN
    SELECT count(*) INTO v_ip_count
    FROM public.whistleblow_submission_attempts
    WHERE ip_address = _ip AND attempted_at >= v_window_start;
  END IF;

  IF _fingerprint IS NOT NULL AND length(trim(_fingerprint)) > 0 THEN
    SELECT count(*) INTO v_fp_count
    FROM public.whistleblow_submission_attempts
    WHERE fingerprint = _fingerprint AND attempted_at >= v_window_start;
  END IF;

  RETURN jsonb_build_object(
    'allowed', (v_ip_count < _max_per_ip AND v_fp_count < _max_per_fingerprint),
    'ip_count', v_ip_count,
    'fp_count', v_fp_count,
    'max_per_ip', _max_per_ip,
    'max_per_fingerprint', _max_per_fingerprint,
    'window_minutes', _window_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_whistleblow_rate_limit(TEXT, TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_whistleblow_rate_limit(TEXT, TEXT, INT, INT, INT) TO service_role;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724121648_3b852db1-ffac-46c3-aec5-d1796460114d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724180259_4773ed8d-5e51-456e-ab45-bdcfd0a5d91d.sql
-- =====================================================================
-- 1) Re-grant table access on core tables (grants got wiped, causing "permission denied")
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT ALL ON public.risks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_continuity_plans TO authenticated;
GRANT ALL ON public.business_continuity_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_report_archives TO authenticated;
GRANT ALL ON public.board_report_archives TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risk_events TO service_role;

-- 2) ai_predictions: add columns the app uses
ALTER TABLE public.ai_predictions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_predictions_status ON public.ai_predictions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_predictions TO authenticated;
GRANT ALL ON public.ai_predictions TO service_role;

-- 3) whistleblow_cases: add columns expected by app and edge functions
ALTER TABLE public.whistleblow_cases
  ADD COLUMN IF NOT EXISTS case_reference text,
  ADD COLUMN IF NOT EXISTS reporter_passphrase_hash text,
  ADD COLUMN IF NOT EXISTS date_of_incident date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS individuals_involved text,
  ADD COLUMN IF NOT EXISTS evidence_description text;

-- Backfill case_reference from existing case_number where possible
UPDATE public.whistleblow_cases
  SET case_reference = case_number
  WHERE case_reference IS NULL AND case_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whistleblow_cases_case_reference_key
  ON public.whistleblow_cases(case_reference)
  WHERE case_reference IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whistleblow_cases TO authenticated;
GRANT ALL ON public.whistleblow_cases TO service_role;

-- 4) whistleblow_attachments: create if missing
CREATE TABLE IF NOT EXISTS public.whistleblow_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  uploaded_by_type text NOT NULL DEFAULT 'reporter',
  uploaded_by uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.whistleblow_attachments TO authenticated;
GRANT ALL ON public.whistleblow_attachments TO service_role;

ALTER TABLE public.whistleblow_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='whistleblow_attachments'
      AND policyname='Investigators can view attachments'
  ) THEN
    CREATE POLICY "Investigators can view attachments"
      ON public.whistleblow_attachments FOR SELECT TO authenticated
      USING (public.user_has_role(auth.uid(), 'RMD'::user_role)
          OR public.user_has_role(auth.uid(), 'CRO'::user_role)
          OR public.user_has_role(auth.uid(), 'ADMIN'::user_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='whistleblow_attachments'
      AND policyname='Investigators can insert attachments'
  ) THEN
    CREATE POLICY "Investigators can insert attachments"
      ON public.whistleblow_attachments FOR INSERT TO authenticated
      WITH CHECK ((public.user_has_role(auth.uid(), 'RMD'::user_role)
                OR public.user_has_role(auth.uid(), 'CRO'::user_role)
                OR public.user_has_role(auth.uid(), 'ADMIN'::user_role))
               AND uploaded_by_type = 'investigator'
               AND uploaded_by = auth.uid());
  END IF;
END$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724180259_4773ed8d-5e51-456e-ab45-bdcfd0a5d91d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260725094949_523a3872-fa3d-4763-b543-9c84acd6972f.sql
-- =====================================================================

-- 1) auth_failed_attempts: scope SELECT policy to authenticated
DROP POLICY IF EXISTS "Admins can read failed attempts" ON public.auth_failed_attempts;
CREATE POLICY "Admins can read failed attempts"
  ON public.auth_failed_attempts
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role));

-- 2) profiles: scope self-select to authenticated, add explicit INSERT block for clients
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Block client profile inserts" ON public.profiles;
CREATE POLICY "Block client profile inserts"
  ON public.profiles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- 3) risk_mitigation_task_history: add explicit UPDATE/DELETE blocking policies
DROP POLICY IF EXISTS "Block direct task history updates" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history updates"
  ON public.risk_mitigation_task_history
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct task history deletes" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history deletes"
  ON public.risk_mitigation_task_history
  FOR DELETE
  TO authenticated
  USING (false);

-- 4) Storage: rescope bcp-documents policies to authenticated
DROP POLICY IF EXISTS "RMD can delete BCP documents" ON storage.objects;
DROP POLICY IF EXISTS "RMD can update BCP documents" ON storage.objects;
DROP POLICY IF EXISTS "RMD can upload BCP documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view BCP documents they have access to" ON storage.objects;

CREATE POLICY "RMD can upload BCP documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]))
  );

CREATE POLICY "RMD can update BCP documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]))
  );

CREATE POLICY "RMD can delete BCP documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]))
  );

CREATE POLICY "Users can view BCP documents they have access to"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- 5) Restrict avatars bucket SELECT (public bucket allows listing warning)
-- Replace broad public SELECT with per-object read that requires knowing the path.
-- Avatars remain accessible via signed URLs / direct paths; only listing is blocked.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
-- Keep public read of individual objects by allowing SELECT scoped to bucket only,
-- but revoke list on bucket via not exposing prefix wildcard patterns.
-- Since Supabase SELECT policy governs list too, restrict to authenticated only.
CREATE POLICY "Authenticated users can read avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- 6) SECURITY DEFINER function EXECUTE grants: revoke PUBLIC/anon and grant to authenticated
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant anon access for login-flow and public whistleblow functions
GRANT EXECUTE ON FUNCTION public.is_account_locked(text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_failed_login_attempts(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_whistleblow_rate_limit(text, text, integer, integer, integer) TO anon;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260725094949_523a3872-fa3d-4763-b543-9c84acd6972f.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260725095623_8f3d9c29-0e83-4e37-b9fb-c6f7078a7841.sql
-- =====================================================================

-- 1. BCP documents storage: restrict SELECT to users associated with the BCP
DROP POLICY IF EXISTS "Users can view BCP documents they have access to" ON storage.objects;
CREATE POLICY "Users can view BCP documents they have access to"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bcp-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role,'ERMSC'::user_role,'EC'::user_role,'RCB'::user_role])
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_continuity_plans b
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE (
        -- file path convention: <bcp_id>/... — match either by id prefix or by referenced plan
        position(b.id::text in name) = 1
      )
      AND (
        b.owner_id = auth.uid()
        OR b.created_by = auth.uid()
        OR (b.department IS NOT NULL AND b.department = p.department)
      )
    )
  )
);

-- 2. control_documents: restrict which columns non-admin owners can update
CREATE OR REPLACE FUNCTION public.enforce_control_document_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
  ) INTO v_is_admin;

  IF NOT COALESCE(v_is_admin, false) THEN
    IF NEW.owner_id      IS DISTINCT FROM OLD.owner_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.status     IS DISTINCT FROM OLD.status
       OR NEW.document_type IS DISTINCT FROM OLD.document_type
    THEN
      RAISE EXCEPTION 'Only RMD/CRO/ADMIN can change ownership, status, or document type on control documents'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_control_document_update_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_control_document_update_scope ON public.control_documents;
CREATE TRIGGER trg_enforce_control_document_update_scope
BEFORE UPDATE ON public.control_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_control_document_update_scope();

-- 3. whistleblow_cases: explicit block on anon writes (submission goes through edge function w/ service role)
DROP POLICY IF EXISTS "Block anon writes on whistleblow_cases" ON public.whistleblow_cases;
CREATE POLICY "Block anon writes on whistleblow_cases"
ON public.whistleblow_cases
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

REVOKE INSERT, UPDATE, DELETE ON public.whistleblow_cases FROM anon;

-- 4. Revoke EXECUTE from anon/authenticated on SECURITY DEFINER trigger functions
-- (trigger functions run under the trigger's context; direct EXECUTE is not needed)
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    'assign_bcp_reference','assign_risk_event_reference','create_bcp_audit_log',
    'create_risk_audit_log','enforce_profile_department_admin_only','enforce_risk_appetite',
    'generate_risk_reference','handle_new_user','log_approval_status_audit',
    'log_bcp_status_audit','log_mitigation_task_insert','log_mitigation_task_status_change',
    'log_profile_role_change','log_profile_update_audit','log_risk_category_change',
    'log_risk_event_audit','log_risk_status_change','log_user_role_change',
    'notify_approval_status_change','prevent_profile_role_self_escalation',
    'prevent_risk_category_delete_if_in_use','record_bcp_version_history',
    'set_forum_updated_meta','sync_risk_category_enum','validate_bcp_bia_test_fields',
    'validate_mitigation_task_transition'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Also revoke from anon on internal helpers not intended for direct anon calls
REVOKE EXECUTE ON FUNCTION public.log_system_audit(uuid, text, text, text, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_user_activity(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_backup_operation(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_locked(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_auth_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_backup_status_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_approval_inbox() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_workflow_transition(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_approval_action(uuid, text, approval_status, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_password_change_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_risk(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_template_manager() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.risk_category_usage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_risk_appetite(risk_type, risk_category, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_reference_number(text) FROM PUBLIC, anon;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260725095623_8f3d9c29-0e83-4e37-b9fb-c6f7078a7841.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260725101728_ffea2794-1ad3-48bb-9417-7b0675ddc4c8.sql
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can read avatars" ON storage.objects;

CREATE POLICY "Users can read their own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260725101728_ffea2794-1ad3-48bb-9417-7b0675ddc4c8.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726052511_b7d8a122-7bed-4ff8-b4c4-7f6707d9b24a.sql
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risk_events TO service_role;

ALTER TABLE public.whistleblow_cases ALTER COLUMN case_number DROP NOT NULL;
UPDATE public.whistleblow_cases SET case_number = case_reference WHERE case_number IS NULL AND case_reference IS NOT NULL;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260726052511_b7d8a122-7bed-4ff8-b4c4-7f6707d9b24a.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726054841_be7a6738-2bd1-4ebe-af88-ff192ccb3c1c.sql
-- =====================================================================

ALTER TABLE public.risk_events
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Backfill existing rows: default owner is the reporter
UPDATE public.risk_events
SET owner_id = reported_by
WHERE owner_id IS NULL;

-- Extend the incident audit trigger whitelist to include owner_id changes
CREATE OR REPLACE FUNCTION public.log_risk_event_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_severity text := 'low';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(auth.uid(), NEW.reported_by),
      'incident_created',
      'data_modification',
      'incident',
      NEW.id,
      jsonb_build_object(
        'reference_number', NEW.reference_number,
        'title', NEW.title,
        'severity', NEW.severity,
        'status', NEW.status,
        'owner_id', NEW.owner_id
      ),
      'medium'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(ARRAY[
      'title','status','severity','risk_posture','event_date','discovered_date','resolution_date',
      'financial_impact','event_description','root_cause','immediate_response','operational_impact',
      'reputational_impact','lessons_learned','impact_amount','impact_description','resolution_notes',
      'owner_id'
    ]) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key));
      END IF;
    END LOOP;

    IF v_changes <> '{}'::jsonb THEN
      IF (v_changes ? 'status') OR (v_changes ? 'severity') OR (v_changes ? 'owner_id') THEN
        v_severity := 'high';
      ELSE
        v_severity := 'medium';
      END IF;
      PERFORM public.log_system_audit(
        auth.uid(),
        CASE WHEN v_changes ? 'owner_id' AND (SELECT count(*) FROM jsonb_object_keys(v_changes)) = 1
             THEN 'incident_owner_changed'
             ELSE 'incident_updated' END,
        'data_modification',
        'incident',
        NEW.id,
        jsonb_build_object(
          'reference_number', NEW.reference_number,
          'title', NEW.title,
          'changes', v_changes
        ),
        v_severity
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'incident_deleted',
      'data_modification',
      'incident',
      OLD.id,
      jsonb_build_object('reference_number', OLD.reference_number, 'title', OLD.title),
      'high'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726054841_be7a6738-2bd1-4ebe-af88-ff192ccb3c1c.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726060801_3605db91-2b77-4287-b487-cecab97e00a3.sql
-- =====================================================================

-- 1. Extend notification_preferences with in-app category toggles + quiet hours
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS risk_updates_in_app     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bcp_changes_in_app      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_uploads_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS system_alerts_in_app    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approvals_in_app        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appetite_in_app         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start       time    NOT NULL DEFAULT '22:00'::time,
  ADD COLUMN IF NOT EXISTS quiet_hours_end         time    NOT NULL DEFAULT '07:00'::time;

-- 2. Extend the existing incident audit trigger so an owner change also fans out
--    notifications carrying the audit_log_id (for timeline deep-link + highlight).
CREATE OR REPLACE FUNCTION public.log_risk_event_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_severity text := 'low';
  v_audit_id uuid;
  v_actor uuid := auth.uid();
  v_from_owner uuid;
  v_to_owner   uuid;
  v_recipient  uuid;
  v_from_name  text;
  v_to_name    text;
  v_title      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(v_actor, NEW.reported_by),
      'incident_created',
      'data_modification',
      'incident',
      NEW.id,
      jsonb_build_object(
        'reference_number', NEW.reference_number,
        'title', NEW.title,
        'severity', NEW.severity,
        'status', NEW.status,
        'owner_id', NEW.owner_id
      ),
      'medium'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(ARRAY[
      'title','status','severity','risk_posture','event_date','discovered_date','resolution_date',
      'financial_impact','event_description','root_cause','immediate_response','operational_impact',
      'reputational_impact','lessons_learned','impact_amount','impact_description','resolution_notes',
      'owner_id'
    ]) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key));
      END IF;
    END LOOP;

    IF v_changes <> '{}'::jsonb THEN
      IF (v_changes ? 'status') OR (v_changes ? 'severity') OR (v_changes ? 'owner_id') THEN
        v_severity := 'high';
      ELSE
        v_severity := 'medium';
      END IF;
      v_audit_id := public.log_system_audit(
        v_actor,
        CASE WHEN v_changes ? 'owner_id' AND (SELECT count(*) FROM jsonb_object_keys(v_changes)) = 1
             THEN 'incident_owner_changed'
             ELSE 'incident_updated' END,
        'data_modification',
        'incident',
        NEW.id,
        jsonb_build_object(
          'reference_number', NEW.reference_number,
          'title', NEW.title,
          'changes', v_changes
        ),
        v_severity
      );

      -- Fan out owner-change notifications with the audit log id embedded.
      IF v_changes ? 'owner_id' THEN
        v_from_owner := NULLIF(v_changes->'owner_id'->>'from','')::uuid;
        v_to_owner   := NULLIF(v_changes->'owner_id'->>'to','')::uuid;
        SELECT full_name INTO v_from_name FROM public.profiles WHERE user_id = v_from_owner;
        SELECT full_name INTO v_to_name   FROM public.profiles WHERE user_id = v_to_owner;
        v_title := NEW.title;

        FOR v_recipient IN
          SELECT DISTINCT p.user_id
          FROM public.profiles p
          LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
          WHERE p.user_id = v_from_owner
             OR p.user_id = v_to_owner
             OR ur.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[])
        LOOP
          IF v_recipient IS NULL OR v_recipient = v_actor THEN
            CONTINUE;
          END IF;
          INSERT INTO public.notifications
            (user_id, title, message, type, category, resource_type, resource_id, metadata)
          VALUES (
            v_recipient,
            'Incident owner reassigned',
            'Incident "' || COALESCE(v_title,'-') || '" (' || COALESCE(NEW.reference_number,'-') ||
              ') owner changed from ' || COALESCE(v_from_name,'unassigned') ||
              ' to ' || COALESCE(v_to_name,'unassigned') || '.',
            'warning',
            'user_action',
            'incident',
            NEW.id,
            jsonb_build_object(
              'action', 'incident_owner_changed',
              'audit_log_id', v_audit_id,
              'from_owner_id', v_from_owner,
              'to_owner_id',   v_to_owner,
              'reference_number', NEW.reference_number
            )
          );
        END LOOP;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      v_actor,
      'incident_deleted',
      'data_modification',
      'incident',
      OLD.id,
      jsonb_build_object('reference_number', OLD.reference_number, 'title', OLD.title),
      'high'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726060801_3605db91-2b77-4287-b487-cecab97e00a3.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726063100_f63ef505-9c42-49bf-a975-26c908760129.sql
-- =====================================================================
-- Idempotent re-evaluation of risk appetite rules
CREATE OR REPLACE FUNCTION public.reevaluate_risk_appetite(
  p_risk_type public.risk_type DEFAULT NULL,
  p_category  public.risk_category DEFAULT NULL,
  p_segment   text DEFAULT NULL,
  p_actor     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r            RECORD;
  v_score      integer;
  v_appetite   RECORD;
  v_segment    text;
  v_actor      uuid := COALESCE(p_actor, auth.uid());
  v_is_leader  boolean;
  v_already    boolean;
  v_scanned    int := 0;
  v_actioned   int := 0;
  v_escalated  int := 0;
  v_flagged    int := 0;
  v_notified   int := 0;
  v_msg        text;
BEGIN
  -- AuthZ: only RMD/CRO/ADMIN may invoke (except when called via trigger with NULL actor).
  IF v_actor IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = v_actor
        AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[])
    ) INTO v_is_leader;
    IF NOT COALESCE(v_is_leader, false) THEN
      RAISE EXCEPTION 'Only RMD, CRO, or ADMIN may re-evaluate risk appetite'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR r IN
    SELECT id, title, risk_reference, risk_type, category, taxpayer_segment,
           residual_likelihood, residual_impact, status, flagged_for_audit,
           owner_id, created_by, assigned_to_id
      FROM public.risks
     WHERE approval_status = 'Approved'
       AND (p_risk_type IS NULL OR risk_type = p_risk_type)
       AND (p_category  IS NULL OR category  = p_category)
       AND (p_segment   IS NULL OR taxpayer_segment = p_segment)
  LOOP
    v_scanned := v_scanned + 1;
    v_score := COALESCE(r.residual_likelihood,0) * COALESCE(r.residual_impact,0);
    v_segment := CASE WHEN r.risk_type = 'compliance' THEN r.taxpayer_segment ELSE NULL END;

    SELECT * INTO v_appetite
      FROM public.resolve_risk_appetite(r.risk_type, r.category, v_segment);

    IF v_appetite.id IS NULL OR v_score < v_appetite.threshold_score THEN
      CONTINUE;
    END IF;

    -- Idempotency: skip if we've already recorded an exceedance at the same
    -- threshold for this risk (regardless of who triggered it) AND the risk
    -- already reflects the configured action.
    SELECT EXISTS (
      SELECT 1 FROM public.system_audit_logs sal
      WHERE sal.resource_type = 'risk'
        AND sal.resource_id   = r.id
        AND sal.action        = 'risk_exceeded_appetite'
        AND (sal.details->>'threshold_score')::int = v_appetite.threshold_score
    ) INTO v_already;

    IF v_already
       AND (
         (v_appetite.escalation_action = 'escalate'    AND r.status = 'Escalated')
         OR (v_appetite.escalation_action = 'flag_audit' AND r.flagged_for_audit = true)
         OR (v_appetite.escalation_action = 'notify')
       )
    THEN
      CONTINUE;
    END IF;

    -- Apply the escalation action (idempotent state writes).
    IF v_appetite.escalation_action = 'escalate' AND r.status <> 'Escalated' THEN
      UPDATE public.risks SET status = 'Escalated'::risk_status WHERE id = r.id;
      v_escalated := v_escalated + 1;
    ELSIF v_appetite.escalation_action = 'flag_audit' AND COALESCE(r.flagged_for_audit,false) = false THEN
      UPDATE public.risks SET flagged_for_audit = true WHERE id = r.id;
      v_flagged := v_flagged + 1;
    END IF;

    -- Notify + audit only when we don't have a prior record for this threshold.
    IF NOT v_already THEN
      v_msg := 'Risk "' || r.title || '" (' || COALESCE(r.risk_reference,'-') ||
               ') residual score ' || v_score || ' has exceeded the configured ' ||
               v_appetite.tolerance_level || ' appetite threshold (' ||
               v_appetite.threshold_score || ').';

      INSERT INTO public.notifications
        (user_id, title, message, type, category, resource_type, resource_id, metadata)
      SELECT DISTINCT p.user_id,
             'Risk exceeds appetite threshold',
             v_msg,
             'warning',
             'risk_update',
             'risk',
             r.id,
             jsonb_build_object(
               'threshold_score', v_appetite.threshold_score,
               'risk_score', v_score,
               'tolerance_level', v_appetite.tolerance_level,
               'escalation_action', v_appetite.escalation_action,
               'source', 'reevaluate_risk_appetite'
             )
        FROM public.profiles p
        LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
       WHERE p.user_id IN (r.owner_id, r.created_by, r.assigned_to_id)
          OR ur.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]);

      PERFORM public.log_system_audit(
        v_actor,
        'risk_exceeded_appetite',
        'data_modification',
        'risk',
        r.id,
        jsonb_build_object(
          'risk_reference', r.risk_reference,
          'risk_score', v_score,
          'threshold_score', v_appetite.threshold_score,
          'tolerance_level', v_appetite.tolerance_level,
          'escalation_action', v_appetite.escalation_action,
          'source', 'reevaluate_risk_appetite'
        ),
        'high'
      );
      v_notified := v_notified + 1;
    END IF;

    v_actioned := v_actioned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned',   v_scanned,
    'actioned',  v_actioned,
    'escalated', v_escalated,
    'flagged',   v_flagged,
    'notified',  v_notified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reevaluate_risk_appetite(public.risk_type, public.risk_category, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reevaluate_risk_appetite(public.risk_type, public.risk_category, text, uuid) TO authenticated;

-- Auto re-scan when appetite rules are added or their impact-relevant fields change.
CREATE OR REPLACE FUNCTION public.rescan_on_appetite_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_should_rescan boolean := false;
  v_target public.risk_appetite_config;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target := NEW;
    v_should_rescan := NEW.is_active;
  ELSIF TG_OP = 'UPDATE' THEN
    v_target := NEW;
    v_should_rescan :=
         NEW.is_active
     AND (
          OLD.is_active         IS DISTINCT FROM NEW.is_active
       OR OLD.threshold_score   IS DISTINCT FROM NEW.threshold_score
       OR OLD.escalation_action IS DISTINCT FROM NEW.escalation_action
       OR OLD.category          IS DISTINCT FROM NEW.category
       OR OLD.taxpayer_segment  IS DISTINCT FROM NEW.taxpayer_segment
       OR OLD.risk_type         IS DISTINCT FROM NEW.risk_type
     );
  END IF;

  IF v_should_rescan THEN
    -- NULL actor => called by the system trigger, skips the RMD/CRO/ADMIN check.
    PERFORM public.reevaluate_risk_appetite(
      v_target.risk_type,
      v_target.category,
      v_target.taxpayer_segment,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rescan_on_appetite_config_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rescan_on_appetite_change ON public.risk_appetite_config;
CREATE TRIGGER trg_rescan_on_appetite_change
AFTER INSERT OR UPDATE ON public.risk_appetite_config
FOR EACH ROW EXECUTE FUNCTION public.rescan_on_appetite_config_change();
INSERT INTO public._onprem_migrations(filename) VALUES ('20260726063100_f63ef505-9c42-49bf-a975-26c908760129.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726063513_d98f65cd-9125-47a8-9496-ea396d7b8f8f.sql
-- =====================================================================

-- 1) Avatars: restrict write policies to authenticated role
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 2) Control documents: ensure department comparison excludes NULLs
DROP POLICY IF EXISTS "Read control documents by role/owner/department" ON storage.objects;

CREATE POLICY "Read control documents by role/owner/department"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'control-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    )
    OR EXISTS (
      SELECT 1
      FROM public.control_documents cd
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE cd.file_url = objects.name
        AND (
          cd.owner_id = auth.uid()
          OR (
            cd.department IS NOT NULL
            AND p.department IS NOT NULL
            AND cd.department = p.department
          )
        )
    )
  )
);

-- 3) user_roles: allow signed-in users to view their own role rows
CREATE POLICY "Users can view their own role assignments"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726063513_d98f65cd-9125-47a8-9496-ea396d7b8f8f.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726063914_f41fc443-d4d8-42de-a5a2-67a32c26c7bb.sql
-- =====================================================================

-- 1) Auto-generate follow_up_token; backfill any nulls
UPDATE public.whistleblow_cases
   SET follow_up_token = encode(gen_random_bytes(32), 'hex')
 WHERE follow_up_token IS NULL OR follow_up_token = '';

ALTER TABLE public.whistleblow_cases
  ALTER COLUMN follow_up_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- 2) Storage policies for whistleblow-evidence bucket
-- Reads restricted to RMD/CRO/ADMIN via user_has_role.
CREATE POLICY "Investigators can read whistleblow evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whistleblow-evidence' AND (
    public.user_has_role(auth.uid(), 'RMD'::user_role)
    OR public.user_has_role(auth.uid(), 'CRO'::user_role)
    OR public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  )
);

-- Anonymous / client writes are blocked; the whistleblow-submit edge function
-- uses the service role and bypasses these policies.

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726063914_f41fc443-d4d8-42de-a5a2-67a32c26c7bb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726064334_7eeffcd1-4bb8-4f3a-8cdb-25be2169b94a.sql
-- =====================================================================

-- 1) user_roles: add explicit WITH CHECK on admin ALL policy for clarity
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
  )
);

-- 2) whistleblow_attachments: allow ADMIN/CRO/RMD to update and delete attachments
CREATE POLICY "Admins can update attachments"
ON public.whistleblow_attachments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
);

CREATE POLICY "Admins can delete attachments"
ON public.whistleblow_attachments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726064334_7eeffcd1-4bb8-4f3a-8cdb-25be2169b94a.sql') ON CONFLICT DO NOTHING;

COMMIT;

-- =====================================================================
-- RiskRadar — On-Premise Post-Install Verification
-- Run AFTER bootstrap AND all application migrations.
-- =====================================================================

\echo '=== 1. Extension check ==='
SELECT extname FROM pg_extension
WHERE extname IN ('pgcrypto','uuid-ossp','pg_trgm','pg_stat_statements','pg_cron','pg_net')
ORDER BY extname;

\echo '=== 2. Required roles ==='
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role','authenticator')
ORDER BY rolname;

\echo '=== 3. Public tables missing GRANT to authenticated ==='
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
ORDER BY c.relname;

\echo '=== 4. Public tables without RLS enabled ==='
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY c.relname;

\echo '=== 5. Public tables with RLS but zero policies (locked) ==='
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
GROUP BY c.relname
HAVING count(p.polname) = 0
ORDER BY c.relname;

\echo '=== 6. Critical enums present ==='
SELECT t.typname, count(e.enumlabel) AS labels
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('user_role','risk_status','approval_status','risk_type','risk_category')
GROUP BY t.typname ORDER BY t.typname;

\echo '=== 7. Critical tables present ==='
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('profiles','user_roles','risks','business_continuity_plans',
                     'risk_events','whistleblow_cases','system_audit_logs',
                     'departments','risk_categories','notifications')
ORDER BY table_name;

\echo '=== 8. Row counts (should be zero on a fresh install) ==='
SELECT 'profiles' AS t, count(*) FROM public.profiles
UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles
UNION ALL SELECT 'risks', count(*) FROM public.risks
UNION ALL SELECT 'business_continuity_plans', count(*) FROM public.business_continuity_plans;

\echo '=== Verification complete ==='

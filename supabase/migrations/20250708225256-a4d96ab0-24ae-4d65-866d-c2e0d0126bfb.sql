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
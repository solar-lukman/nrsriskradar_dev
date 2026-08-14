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
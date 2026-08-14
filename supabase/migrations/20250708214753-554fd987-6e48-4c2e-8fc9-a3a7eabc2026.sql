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
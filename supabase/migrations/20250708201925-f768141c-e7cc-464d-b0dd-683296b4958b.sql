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
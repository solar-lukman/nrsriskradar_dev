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
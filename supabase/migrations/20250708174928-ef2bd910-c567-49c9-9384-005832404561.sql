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
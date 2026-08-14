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
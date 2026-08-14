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
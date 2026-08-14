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
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface BudgetForecast {
  riskId: string;
  riskTitle: string;
  currentUtilization: number;
  dailySpendRate: number;
  daysTo75Percent: number | null;
  daysTo90Percent: number | null;
  daysTo100Percent: number | null;
  projectedExceededDate: Date | null;
  severity: 'critical' | 'warning' | 'normal';
}

interface AggregateForecast {
  overallDailySpendRate: number;
  projectedBudgetDepletionDate: Date | null;
  risksExceeding75Soon: number;
  risksExceeding90Soon: number;
  averageDaysToDepletion: number | null;
}

export function useBudgetForecast() {
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [aggregateForecast, setAggregateForecast] = useState<AggregateForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateForecasts();
  }, []);

  const calculateForecasts = async () => {
    try {
      setLoading(true);

      // Fetch active risks with budgets
      const { data: risks, error: risksError } = await supabase
        .from('risks')
        .select('*')
        .not('mitigation_budget', 'is', null)
        .in('status', ['New', 'In Review', 'Escalated']);

      if (risksError) throw risksError;
      if (!risks || risks.length === 0) {
        setForecasts([]);
        setAggregateForecast(null);
        setLoading(false);
        return;
      }

      // Fetch audit logs to analyze spending trends
      const riskIds = risks.map(r => r.id);
      const { data: auditLogs, error: auditError } = await supabase
        .from('risk_audit_logs')
        .select('*')
        .in('risk_id', riskIds)
        .order('performed_at', { ascending: true });

      if (auditError) throw auditError;

      const riskForecasts: BudgetForecast[] = risks.map(risk => 
        calculateRiskForecast(risk, auditLogs || [])
      ).filter(f => f !== null) as BudgetForecast[];

      setForecasts(riskForecasts);
      setAggregateForecast(calculateAggregateForecast(riskForecasts, risks));

    } catch (error) {
      console.error('Error calculating budget forecasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateRiskForecast = (
    risk: Risk, 
    allAuditLogs: any[]
  ): BudgetForecast | null => {
    const budget = Number(risk.mitigation_budget) || 0;
    const spent = Number(risk.mitigation_budget_spent) || 0;
    const currentUtilization = budget > 0 ? (spent / budget) * 100 : 0;

    if (budget === 0 || spent === 0) {
      return null;
    }

    // Get audit logs for this specific risk that involve budget changes
    const riskLogs = allAuditLogs
      .filter(log => log.risk_id === risk.id && log.action === 'updated')
      .filter(log => {
        const changes = log.changes as any;
        return changes?.after?.mitigation_budget_spent !== undefined;
      })
      .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());

    let dailySpendRate = 0;

    if (riskLogs.length >= 2) {
      // Calculate spend rate from historical data
      const firstLog = riskLogs[0];
      const lastLog = riskLogs[riskLogs.length - 1];
      
      const firstSpent = Number((firstLog.changes as any)?.after?.mitigation_budget_spent || 0);
      const lastSpent = Number((lastLog.changes as any)?.after?.mitigation_budget_spent || 0);
      const spentDiff = lastSpent - firstSpent;
      
      const firstDate = new Date(firstLog.performed_at);
      const lastDate = new Date(lastLog.performed_at);
      const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 0 && spentDiff > 0) {
        dailySpendRate = spentDiff / daysDiff;
      }
    } else if (spent > 0) {
      // Fallback: estimate based on time since creation
      const createdDate = new Date(risk.created_at);
      const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceCreation > 0) {
        dailySpendRate = spent / daysSinceCreation;
      }
    }

    // Calculate days to reach thresholds
    const remaining = budget - spent;
    const daysTo75Percent = currentUtilization < 75 && dailySpendRate > 0
      ? ((budget * 0.75) - spent) / dailySpendRate
      : null;
    const daysTo90Percent = currentUtilization < 90 && dailySpendRate > 0
      ? ((budget * 0.90) - spent) / dailySpendRate
      : null;
    const daysTo100Percent = currentUtilization < 100 && dailySpendRate > 0
      ? remaining / dailySpendRate
      : null;

    const projectedExceededDate = daysTo100Percent && daysTo100Percent > 0
      ? new Date(Date.now() + daysTo100Percent * 24 * 60 * 60 * 1000)
      : null;

    const severity: 'critical' | 'warning' | 'normal' = 
      (daysTo90Percent !== null && daysTo90Percent <= 30) ? 'critical' :
      (daysTo75Percent !== null && daysTo75Percent <= 60) ? 'warning' : 'normal';

    return {
      riskId: risk.id,
      riskTitle: risk.title,
      currentUtilization,
      dailySpendRate,
      daysTo75Percent,
      daysTo90Percent,
      daysTo100Percent,
      projectedExceededDate,
      severity
    };
  };

  const calculateAggregateForecast = (
    forecasts: BudgetForecast[],
    risks: Risk[]
  ): AggregateForecast => {
    const totalBudget = risks.reduce((sum, risk) => 
      sum + (Number(risk.mitigation_budget) || 0), 0);
    const totalSpent = risks.reduce((sum, risk) => 
      sum + (Number(risk.mitigation_budget_spent) || 0), 0);

    const overallDailySpendRate = forecasts.reduce((sum, f) => 
      sum + f.dailySpendRate, 0);

    const remaining = totalBudget - totalSpent;
    const projectedBudgetDepletionDate = overallDailySpendRate > 0
      ? new Date(Date.now() + (remaining / overallDailySpendRate) * 24 * 60 * 60 * 1000)
      : null;

    const risksExceeding75Soon = forecasts.filter(f => 
      f.daysTo75Percent !== null && f.daysTo75Percent <= 60
    ).length;

    const risksExceeding90Soon = forecasts.filter(f => 
      f.daysTo90Percent !== null && f.daysTo90Percent <= 30
    ).length;

    const validDepletionDays = forecasts
      .map(f => f.daysTo100Percent)
      .filter(d => d !== null && d > 0) as number[];
    
    const averageDaysToDepletion = validDepletionDays.length > 0
      ? validDepletionDays.reduce((sum, d) => sum + d, 0) / validDepletionDays.length
      : null;

    return {
      overallDailySpendRate,
      projectedBudgetDepletionDate,
      risksExceeding75Soon,
      risksExceeding90Soon,
      averageDaysToDepletion
    };
  };

  return {
    forecasts,
    aggregateForecast,
    loading,
    refetch: calculateForecasts
  };
}

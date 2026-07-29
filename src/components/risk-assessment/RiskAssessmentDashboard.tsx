import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ControlScoreGauge } from './ControlScoreGauge';
import { AssessmentTimeline } from './AssessmentTimeline';
import { ControlEffectivenessChart } from './ControlEffectivenessChart';
import { RiskHeatmapEnhanced } from './RiskHeatmapEnhanced';
import { AddAssessmentDialog } from './AddAssessmentDialog';
import { AddControlDialog } from './AddControlDialog';
import { AIRecommendedControls } from './AIRecommendedControls';
import { supabase } from '@/integrations/supabase/client';
import { Plus, AlertTriangle, Shield, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { AssessmentProgressBadge } from './AssessmentProgressBadge';

interface RiskData {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  control_effectiveness_score: number;
  target_control_score: number;
  last_assessment_date?: string;
  next_assessment_date?: string;
  approval_status?: string;
}

interface Assessment {
  id: string;
  assessment_date: string;
  assessment_type: string;
  likelihood: number;
  impact: number;
  control_score: number;
  assessor_name?: string;
  notes?: string;
}

interface Control {
  id: string;
  control_name: string;
  control_type: string;
  effectiveness_rating: string | number;
  status: string;
  last_tested_date?: string;
  next_test_date?: string;
  test_frequency: string;
}

const ratingToNumber = (rating: string | number): number => {
  if (typeof rating === 'number') return rating;
  switch ((rating || '').toLowerCase()) {
    case 'high': return 90;
    case 'medium': return 60;
    case 'low': return 30;
    default: return 0;
  }
};

interface RiskAssessmentDashboardProps {
  riskIdOverride?: string;
  /** Called whenever the user creates/edits an assessment or control. */
  onChanged?: () => void;
}

export function RiskAssessmentDashboard({ riskIdOverride, onChanged }: RiskAssessmentDashboardProps = {}) {
  const params = useParams<{ id: string }>();
  const id = riskIdOverride ?? params.id;
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAssessment, setShowAddAssessment] = useState(false);
  const [showAddControl, setShowAddControl] = useState(false);

  useEffect(() => {
    if (id) {
      fetchRiskData();
      fetchAssessments();
      fetchControls();
    }
  }, [id]);

  const fetchRiskData = async () => {
    try {
      const { data, error } = await supabase
        .from('risks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setRisk(data);
    } catch (error) {
      console.error('Error fetching risk:', error);
      toast.error('Failed to load risk data');
    }
  };

  const fetchAssessments = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_assessments')
        .select('*')
        .eq('risk_id', id)
        .order('assessment_date', { ascending: false });

      if (error) throw error;
      
      setAssessments(data || []);
    } catch (error) {
      console.error('Error fetching assessments:', error);
      toast.error('Failed to load assessments');
    }
  };

  const fetchControls = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_controls')
        .select('*')
        .eq('risk_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setControls(data || []);
    } catch (error) {
      console.error('Error fetching controls:', error);
      toast.error('Failed to load controls');
    } finally {
      setLoading(false);
    }
  };

  const handleAssessmentAdded = () => {
    fetchAssessments();
    fetchRiskData();
    setShowAddAssessment(false);
    onChanged?.();
  };

  const handleControlAdded = () => {
    fetchControls();
    fetchRiskData();
    setShowAddControl(false);
    onChanged?.();
  };

  const getRiskScore = (likelihood: number, impact: number) => {
    return likelihood * impact;
  };

  const getRiskLevel = (score: number): { level: string; color: "destructive" | "secondary" | "default" | "outline" } => {
    if (score >= 20) return { level: 'Critical', color: 'destructive' };
    if (score >= 15) return { level: 'High', color: 'destructive' };
    if (score >= 10) return { level: 'Medium', color: 'secondary' };
    if (score >= 5) return { level: 'Low', color: 'outline' };
    return { level: 'Very Low', color: 'secondary' };
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  if (!risk) {
    return <div className="text-center text-destructive">Risk not found</div>;
  }

  const inherentScore = getRiskScore(risk.inherent_likelihood, risk.inherent_impact);
  const residualScore = getRiskScore(risk.residual_likelihood, risk.residual_impact);
  const inherentLevel = getRiskLevel(inherentScore);
  const residualLevel = getRiskLevel(residualScore);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{risk.title}</h1>
          <p className="text-muted-foreground mt-2">{risk.description}</p>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Badge variant="outline">{risk.category}</Badge>
            <Badge variant="secondary">{risk.status}</Badge>
            <AssessmentProgressBadge
              riskId={risk.id}
              approvalStatus={risk.approval_status}
              status={risk.status}
              refreshKey={assessments.length}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddAssessment(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Assessment
          </Button>
          <Button variant="outline" onClick={() => setShowAddControl(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Control
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inherent Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inherentScore}</div>
            <Badge variant={inherentLevel.color} className="mt-2">
              {inherentLevel.level}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Residual Risk</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{residualScore}</div>
            <Badge variant={residualLevel.color} className="mt-2">
              {residualLevel.level}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Control Effectiveness</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{risk.control_effectiveness_score}%</div>
            <p className="text-xs text-muted-foreground">
              Target: {risk.target_control_score}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Reduction</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((inherentScore - residualScore) / inherentScore * 100).toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">
              From {inherentScore} to {residualScore}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Control Score Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ControlScoreGauge
          score={risk.control_effectiveness_score}
          target={risk.target_control_score}
          title="Overall Control Effectiveness"
          size="lg"
        />
        <ControlScoreGauge
          score={controls.filter(c => c.control_type === 'preventive').reduce((acc, c) => acc + ratingToNumber(c.effectiveness_rating), 0) / Math.max(controls.filter(c => c.control_type === 'preventive').length, 1)}
          target={80}
          title="Preventive Controls"
          size="md"
        />
        <ControlScoreGauge
          score={controls.filter(c => c.control_type === 'detective').reduce((acc, c) => acc + ratingToNumber(c.effectiveness_rating), 0) / Math.max(controls.filter(c => c.control_type === 'detective').length, 1)}
          target={80}
          title="Detective Controls"
          size="md"
        />
      </div>

      {/* Detailed Analysis */}
      <Tabs defaultValue="heatmap" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="heatmap">Risk Heatmap</TabsTrigger>
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <TabsTrigger value="history">Assessment History</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="heatmap" className="space-y-4">
          <RiskHeatmapEnhanced riskData={[risk]} />
        </TabsContent>

        <TabsContent value="controls" className="space-y-4">
          <AIRecommendedControls
            riskId={risk.id}
            riskTitle={risk.title}
            existingControls={controls}
            onControlAdded={() => { fetchControls(); fetchRiskData(); }}
          />
          <ControlEffectivenessChart controls={controls} />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <AssessmentTimeline assessments={assessments} />
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Trend Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Trend analysis coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddAssessmentDialog
        open={showAddAssessment}
        onOpenChange={setShowAddAssessment}
        riskId={risk.id}
        onSuccess={handleAssessmentAdded}
      />

      <AddControlDialog
        open={showAddControl}
        onOpenChange={setShowAddControl}
        riskId={risk.id}
        onSuccess={handleControlAdded}
      />
    </div>
  );
}
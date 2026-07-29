import { MainLayout } from '@/components/MainLayout';
import { RiskAssessmentDashboard } from '@/components/risk-assessment/RiskAssessmentDashboard';

export default function RiskAssessment() {
  return (
    <MainLayout>
      <RiskAssessmentDashboard />
    </MainLayout>
  );
}

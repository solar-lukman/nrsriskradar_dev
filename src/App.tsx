import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import LandingPage from "./pages/LandingPage";
import RiskMatrixPage from "./pages/RiskMatrixPage";
import RiskRegisterPage from "./pages/RiskRegisterPage";
import RiskAssessment from "./pages/RiskAssessment";
import ReportsDashboardPage from "./pages/ReportsDashboardPage";
import BusinessContinuityPage from "./pages/BusinessContinuityPage";
import BCPWizardPage from "./pages/BCPWizardPage";
import LearningForumPage from "./pages/LearningForumPage";
import UserManagementPage from "./pages/UserManagementPage";
import SettingsPage from "./pages/SettingsPage";
import FAQPage from "./pages/FAQPage";
import CalendarPage from "./pages/CalendarPage";
import ExecutiveSummaryPage from "./pages/ExecutiveSummaryPage";
import BoardReportsPage from "./pages/BoardReportsPage";
import DataManagementPage from "./pages/DataManagementPage";
import IncidentsDashboardPage from "./pages/IncidentsDashboardPage";
import WhistleblowSubmit from "./pages/WhistleblowSubmit";
import WhistleblowFollowUp from "./pages/WhistleblowFollowUp";
import WhistleblowCases from "./pages/WhistleblowCases";
import WhistleblowCaseDetail from "./pages/WhistleblowCaseDetail";
import AuditLogViewer from "./pages/AuditLogViewer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import BcpSchemaCheckLogsPage from "./pages/BcpSchemaCheckLogsPage";
import ApprovalInboxPage from "./pages/ApprovalInboxPage";
import ControlDocumentsPage from "./pages/ControlDocumentsPage";
import ProfilePage from "./pages/ProfilePage";
import Docs from "./pages/Docs";
import ResetPassword from "./pages/ResetPassword";
import AuthVerification from "./pages/AuthVerification";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Routes that require an authenticated session. Public routes (landing,
// docs, whistleblow intake/follow-up, password reset) stay outside this list.
const protectedRoutes: { path: string; element: JSX.Element }[] = [
  { path: "/risk-matrix", element: <RiskMatrixPage /> },
  { path: "/risk-register", element: <RiskRegisterPage /> },
  { path: "/risk-assessment/:id", element: <RiskAssessment /> },
  { path: "/reports", element: <ReportsDashboardPage /> },
  { path: "/business-continuity", element: <BusinessContinuityPage /> },
  { path: "/business-continuity/new", element: <BCPWizardPage /> },
  { path: "/business-continuity/:id/edit", element: <BCPWizardPage /> },
  { path: "/learning-forum", element: <LearningForumPage /> },
  { path: "/user-management", element: <UserManagementPage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/calendar", element: <CalendarPage /> },
  { path: "/executive-summary", element: <ExecutiveSummaryPage /> },
  { path: "/board-reports", element: <BoardReportsPage /> },
  { path: "/data-management", element: <DataManagementPage /> },
  { path: "/incidents", element: <IncidentsDashboardPage /> },
  { path: "/whistleblow/cases", element: <WhistleblowCases /> },
  { path: "/whistleblow/cases/:id", element: <WhistleblowCaseDetail /> },
  {
    path: "/audit-logs",
    element: (
      <ErrorBoundary
        fallbackTitle="Audit Logs failed to load"
        fallbackMessage="We hit an unexpected error while rendering the audit logs page. Try again, or reload to recover."
      >
        <AuditLogViewer />
      </ErrorBoundary>
    ),
  },
  { path: "/bcp-schema-checks", element: <BcpSchemaCheckLogsPage /> },
  { path: "/approvals", element: <ApprovalInboxPage /> },
  { path: "/control-documents", element: <ControlDocumentsPage /> },
  { path: "/profile", element: <ProfilePage /> },
  { path: "/admin/auth-verification", element: <AuthVerification /> },
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <NotificationProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/help" element={<FAQPage />} />
              <Route path="/whistleblow" element={<WhistleblowSubmit />} />
              <Route path="/whistleblow/submit" element={<WhistleblowSubmit />} />
              <Route path="/whistleblow/status" element={<WhistleblowFollowUp />} />
              <Route path="/whistleblow/follow-up" element={<WhistleblowFollowUp />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:slug" element={<Docs />} />
              <Route path="/app" element={<Index />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Authenticated routes */}
              {protectedRoutes.map(({ path, element }) => (
                <Route
                  key={path}
                  path={path}
                  element={<ProtectedRoute>{element}</ProtectedRoute>}
                />
              ))}

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

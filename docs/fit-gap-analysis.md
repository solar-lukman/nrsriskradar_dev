# Fit-Gap Analysis & Development Plan
## NRS Risk Management Portal Customization

---

## 1. Fit-Gap Analysis

### A. What Already Fits (No Changes Needed)

| FRD Requirement | Current RiskRadar Feature |
|---|---|
| Institutional Risk Register with standard ERM fields | `risks` table with title, description, category, likelihood, impact, rating, status, owner, mitigation |
| 5x5 Risk Matrix with RAG colours | Interactive heatmap on `/risk-matrix` with configurable scales |
| Business Continuity Management (BIA, recovery) | BCP module at `/business-continuity` with BIA section |
| AI Assistance for risk queries | AI scoring, recommendations, and report generation already integrated |
| Role-based access control | 10 roles implemented (RC, RR, RO, RMD, CRO, ERMSC, EC, RCB, ADMIN, USER) |
| Auto-logout after inactivity | `useAutoLogout` hook active |
| Audit trail for risk edits | `risk_history` table with JSON diffs |
| Real-time dashboards with filters | Dashboard at `/app` with department/severity/trend filters |
| Mitigation action tracking with owners/timelines | Treatment tasks system with assignees, due dates, status |
| Document repository | Control Documents module at `/control-documents` |
| Online Discussion & Learning Forum | Learning Forum at `/learning-forum` |
| Board/Executive reporting | Board Reports + Executive Summary modules |
| Bulk data import (Excel/CSV) | LoB Data Import and Bulk Upload dialogs |
| Incident reporting (Crystallized risks) | Crystallized status + Incidents Dashboard |
| Budget tracking in NGN | Mitigation budget fields with NGN currency |
| Notifications & email reminders | Notification system + Supabase edge functions for emails |
| Whistleblowing / anonymous reporting | Full module at `/whistleblow` |

### B. Gaps Requiring Development

| # | FRD Requirement | Gap Description | Priority |
|---|---|---|---|
| **G1** | **Two separate registers (Institutional + Compliance)** | Current system has one unified risk register. FRD requires a distinct **Compliance Risk Register** with fields: tax type, estimated tax at risk, sector/sub-sector, compliance description, sources of information, treatment timeline, treatment owner vs risk owner, monitoring officer. | **Critical** |
| **G2** | **NRS branding** | App branded as "RiskRadar" with generic logo. Must rebrand to "NRS Risk Management Portal" with NRS logo, NRS colour palette, and NRS-specific terminology throughout. | **Critical** |
| **G3** | **Auto-generated number series** | No auto-numbering. FRD requires structured IDs: `IR<YY><MM><SEQ>` for institutional risks, `CR<YY><MM><SEQ>` for compliance, `IC<YY><MM><SEQ>` for incidents, `AC<YY><MM><SEQ>` for actions, `BC<YY><MM><SEQ>` for BCP. | **High** |
| **G4** | **Approval workflow** | No multi-stage approval. FRD requires submit → review (RR) → approve (Supervisor) workflow with return-for-revision capability and email notifications at each stage. | **High** |
| **G5** | **Risk Appetite & Tolerance engine** | No threshold-based escalation. FRD requires configurable appetite levels per risk category (institutional) and per taxpayer segment (compliance), with auto-flagging and escalation when thresholds are breached. | **High** |
| **G6** | **Compliance-specific risk categories** | Current categories are generic ERM. Compliance register needs categories by taxpayer obligation: Registration, Filing, Disclosure/Reporting, Payment. | **Medium** |
| **G7** | **4x4 matrix support for Compliance register** | Current matrix is 5x5. The Compliance Risk Register template uses a 4x4 matrix (1-4 scale). System needs to support both matrix sizes. | **Medium** |
| **G8** | **Supervisor role** | Not in current role enum. FRD defines Supervisor as a distinct role that approves submissions. | **Medium** |
| **G9** | **Control effectiveness tracking** | Partially implemented (score field exists). FRD templates require explicit High/Medium/Low effectiveness rating and post-control reassessment fields. | **Medium** |
| **G10** | **"Related Objective" field** | Institutional template links each risk to a related objective. Current `strategic_objective` field exists but may need alignment. | **Low** |
| **G11** | **External system integrations (CAC, NIMC, NITDA)** | Not implemented. Out of scope for portal MVP but needs placeholder/configuration. | **Low** |
| **G12** | **M-Files EDRMS integration** | Document repository exists but no actual M-Files API integration. | **Low** |
| **G13** | **Active Directory authentication** | Auth uses Supabase email/password. AD/SSO integration not implemented. | **Low** |

---

## 2. Development Plan

### Phase 1: Branding & Identity (1-2 days)
- Replace "RiskRadar" with "NRS Risk Management Portal" across all UI
- Swap logo asset to NRS logo
- Update CSS design tokens to NRS brand colours
- Update Landing Page, Login, Header, Sidebar, Footer
- Update docs and meta tags

### Phase 2: Compliance Risk Register (3-5 days)
- Add `risk_type` column (institutional/compliance)
- Add compliance-specific fields (tax_type, estimated_tax_at_risk, etc.)
- Register type toggle/tabs on Risk Register page
- Conditional fields in Risk Wizard dialog

### Phase 3: Number Series & Approval Workflow (2-3 days)
- Auto-generated reference numbers (IR/CR/IC/AC/BC prefixes)
- Multi-stage approval (Draft → Submitted → Under Review → Approved)
- Supervisor role addition

### Phase 4: Risk Appetite & Tolerance (2-3 days)
- Configurable thresholds per category
- Auto-escalation and dashboard indicators

### Phase 5: Matrix Flexibility & Control Effectiveness (1-2 days)
- Support both 4x4 and 5x5 matrices
- Control effectiveness rating (High/Medium/Low)

### Phase 6: Integration Placeholders (1 day)
- Settings section for M-Files, AD, CAC, NIMC, NITDA

**Total estimated effort: 10-16 days**

-- Insert sample Nigerian business context data for risks and BCPs

-- First, let's insert some sample profiles for risk owners and creators
INSERT INTO public.profiles (user_id, email, full_name, role, department) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'adebayo.okafor@riskradar.ng', 'Adebayo Okafor', 'RMD', 'Risk Management'),
('550e8400-e29b-41d4-a716-446655440002', 'fatima.hassan@riskradar.ng', 'Fatima Hassan', 'CRO', 'Executive'),
('550e8400-e29b-41d4-a716-446655440003', 'chioma.eze@riskradar.ng', 'Chioma Eze', 'RC', 'IT Department'),
('550e8400-e29b-41d4-a716-446655440004', 'ibrahim.mohammed@riskradar.ng', 'Ibrahim Mohammed', 'RO', 'Operations'),
('550e8400-e29b-41d4-a716-446655440005', 'ngozi.okwu@riskradar.ng', 'Ngozi Okwu', 'RC', 'Finance'),
('550e8400-e29b-41d4-a716-446655440006', 'yusuf.abdullahi@riskradar.ng', 'Yusuf Abdullahi', 'RO', 'Compliance'),
('550e8400-e29b-41d4-a716-446655440007', 'blessing.nwankwo@riskradar.ng', 'Blessing Nwankwo', 'RC', 'HR'),
('550e8400-e29b-41d4-a716-446655440008', 'ahmed.bello@riskradar.ng', 'Ahmed Bello', 'RO', 'Operations')
ON CONFLICT (user_id) DO NOTHING;

-- Insert 15 risks with Nigerian business context
INSERT INTO public.risks (
  id, title, description, category, department, owner_id, assigned_to_id, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, created_by
) VALUES 
-- High Risk (4 risks) - Score 15-20
('risk-001', 'Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-002', 'Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', '550e8400-e29b-41d4-a716-446655440001'),

('risk-003', 'CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', '550e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440006', 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', '550e8400-e29b-41d4-a716-446655440001'),

('risk-004', 'Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', '550e8400-e29b-41d4-a716-446655440001'),

-- Medium Risk (8 risks) - Score 8-14
('risk-005', 'Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', '550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440007', 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', '550e8400-e29b-41d4-a716-446655440001'),

('risk-006', 'NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440006', 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-007', 'Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', '550e8400-e29b-41d4-a716-446655440001'),

('risk-008', 'Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', '550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440007', 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-009', 'FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', '550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440006', 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', '550e8400-e29b-41d4-a716-446655440001'),

('risk-010', 'Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', '550e8400-e29b-41d4-a716-446655440001'),

('risk-011', 'Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', '550e8400-e29b-41d4-a716-446655440001'),

('risk-012', 'ERP System Migration', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', '550e8400-e29b-41d4-a716-446655440001'),

-- Low Risk (3 risks) - Score 5-7
('risk-013', 'Office Space Expansion', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-014', 'Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440008', 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', '550e8400-e29b-41d4-a716-446655440001'),

('risk-015', 'Social Media Reputation', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', '550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440007', 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', '550e8400-e29b-41d4-a716-446655440001');

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  id, title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('bcp-001', 'Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', '550e8400-e29b-41d4-a716-446655440003', 4, 1, 'Active', 'Tested', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-002', 'Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', '550e8400-e29b-41d4-a716-446655440005', 2, 0, 'Active', 'Needs Testing',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-003', 'Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', '550e8400-e29b-41d4-a716-446655440004', 1, 0, 'Active', 'Tested',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-004', 'Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', '550e8400-e29b-41d4-a716-446655440008', 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001'),

('bcp-005', 'Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', '550e8400-e29b-41d4-a716-446655440006', 8, 2, 'Active', 'Needs Testing',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
'550e8400-e29b-41d4-a716-446655440001');

-- Update some timestamps to make data more realistic
UPDATE public.risks SET 
  created_at = created_at - INTERVAL '30 days' + (RANDOM() * INTERVAL '25 days'),
  updated_at = created_at + (RANDOM() * INTERVAL '20 days')
WHERE id LIKE 'risk-%';

UPDATE public.business_continuity_plans SET 
  created_at = created_at - INTERVAL '60 days' + (RANDOM() * INTERVAL '45 days'),
  updated_at = created_at + (RANDOM() * INTERVAL '30 days'),
  last_updated_date = CURRENT_DATE - (RANDOM() * INTERVAL '30 days')::integer,
  next_test_date = CURRENT_DATE + (RANDOM() * INTERVAL '180 days')::integer
WHERE id LIKE 'bcp-%';
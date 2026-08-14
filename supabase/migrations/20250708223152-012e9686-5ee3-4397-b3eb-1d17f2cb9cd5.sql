-- Insert sample Nigerian business context data for risks and BCPs
-- Using a placeholder user ID that can be updated later

-- Insert 15 risks with Nigerian business context using a placeholder user
INSERT INTO public.risks (
  title, description, category, department, 
  inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, 
  status, mitigation_plan, target_date, review_date, 
  created_by, owner_id, assigned_to_id
) VALUES 
-- High Risk (4 risks) - Score 15-20
('Power Grid Instability Impact', 'Frequent power outages affecting operations and data center availability in Lagos facility', 'Operational', 'Operations', 5, 4, 3, 3, 'New', 'Install backup generators and UPS systems. Negotiate with Eko DisCo for dedicated line.', '2025-03-15', '2025-02-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Naira Currency Volatility', 'Foreign exchange fluctuations affecting USD-denominated contracts and imports', 'Financial', 'Finance', 4, 5, 2, 4, 'In Review', 'Implement currency hedging strategies and local supplier sourcing programs.', '2025-04-30', '2025-02-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('CBN Regulatory Changes', 'Central Bank of Nigeria policy changes affecting banking and fintech operations', 'Compliance', 'Compliance', 4, 4, 3, 3, 'In Review', 'Establish dedicated regulatory monitoring team and maintain close CBN liaison.', '2025-02-28', '2025-01-30', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Cybersecurity Threats from Yahoo Boys', 'Increased sophisticated cyber attacks targeting Nigerian financial institutions', 'Technology', 'IT Department', 5, 4, 2, 3, 'New', 'Deploy advanced threat detection, employee training, and multi-factor authentication.', '2025-03-01', '2025-02-10', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

-- Medium Risk (8 risks) - Score 8-14
('Lagos Traffic Disruptions', 'Traffic congestion affecting employee productivity and client meetings', 'Operational', 'HR', 4, 3, 2, 2, 'In Review', 'Implement flexible work arrangements and virtual meeting protocols.', '2025-04-15', '2025-02-20', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('NDPR Compliance Gap', 'Nigeria Data Protection Regulation compliance requirements not fully met', 'Compliance', 'IT Department', 3, 4, 2, 3, 'New', 'Conduct NDPR gap analysis and implement data protection framework.', '2025-05-30', '2025-03-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Fuel Subsidy Removal Impact', 'Removal of fuel subsidies increasing operational costs significantly', 'Financial', 'Finance', 4, 3, 3, 2, 'In Review', 'Budget adjustments and alternative energy source evaluation.', '2025-06-30', '2025-03-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Key Personnel Retention', 'High turnover risk for critical IT and finance staff due to brain drain', 'Human Resources', 'HR', 3, 3, 2, 3, 'New', 'Implement retention bonuses and career development programs.', '2025-08-31', '2025-04-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('FIRS Tax Policy Changes', 'Federal Inland Revenue Service introducing new digital tax requirements', 'Compliance', 'Finance', 3, 4, 2, 2, 'In Review', 'Engage tax consultants and upgrade financial reporting systems.', '2025-07-15', '2025-03-30', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Internet Connectivity Issues', 'Poor internet infrastructure affecting remote work and cloud services', 'Technology', 'IT Department', 4, 2, 3, 2, 'New', 'Establish redundant ISP connections and satellite backup options.', '2025-05-15', '2025-02-28', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Supplier Payment Delays', 'Local suppliers experiencing payment delays due to cash flow constraints', 'Operational', 'Operations', 3, 3, 2, 2, 'Mitigated', 'Diversify supplier base and implement early payment discount programs.', '2025-04-01', '2025-02-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('ERP System Migration Risk', 'Risk of data loss during migration to new enterprise resource planning system', 'Technology', 'IT Department', 2, 4, 1, 3, 'In Review', 'Comprehensive testing environment and phased migration approach.', '2025-09-30', '2025-05-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

-- Low Risk (3 risks) - Score 5-7
('Office Space Expansion Need', 'Need for additional office space in Abuja affecting growth plans', 'Strategic', 'Operations', 2, 3, 2, 2, 'New', 'Evaluate co-working spaces and hybrid work model implementation.', '2025-12-31', '2025-06-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Vendor Contract Renewals', 'Multiple vendor contracts expiring requiring renegotiation', 'Operational', 'Operations', 2, 2, 1, 2, 'Mitigated', 'Establish vendor relationship management process and early renewal timeline.', '2025-11-30', '2025-07-01', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Social Media Reputation Risk', 'Potential negative social media coverage affecting brand reputation', 'Reputational', 'Marketing', 2, 2, 1, 2, 'New', 'Implement social media monitoring and crisis communication protocol.', '2025-10-15', '2025-05-15', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 'd364a9ad-0ab0-432a-a333-37518a8d2b87');

-- Insert 5 Business Continuity Plans covering critical business functions
INSERT INTO public.business_continuity_plans (
  title, description, business_function, department, owner_id, 
  recovery_time_objective, recovery_point_objective, status, test_status,
  dependencies, mitigation_actions, supporting_documents, created_by
) VALUES 
('Lagos Data Center Continuity Plan', 'Comprehensive plan for maintaining operations during Lagos data center disruptions including power outages and infrastructure failures', 'Data Center Operations', 'IT Department', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 4, 1, 'Active', 'Tested', 
ARRAY['Backup generators', 'Alternative internet providers', 'Cloud infrastructure'], 
'[{"action": "Activate backup generators within 30 minutes", "owner": "IT Operations", "timeline": "0-30 mins"}, {"action": "Migrate critical services to cloud", "owner": "Cloud Team", "timeline": "30-60 mins"}, {"action": "Notify stakeholders", "owner": "Communications", "timeline": "0-15 mins"}]'::jsonb,
'[{"name": "Generator SOP", "url": "/docs/generator-sop.pdf"}, {"name": "Cloud Migration Playbook", "url": "/docs/cloud-migration.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Financial Systems Recovery Plan', 'Plan for maintaining financial operations during system outages, including banking connections and payment processing', 'Financial Operations', 'Finance', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 2, 0, 'Active', 'Needs Testing',
ARRAY['Backup banking channels', 'Manual payment processes', 'Alternative accounting systems'],
'[{"action": "Switch to backup banking portal", "owner": "Treasury Team", "timeline": "0-15 mins"}, {"action": "Activate manual payment approval", "owner": "Finance Manager", "timeline": "15-30 mins"}, {"action": "Implement cash flow monitoring", "owner": "CFO Office", "timeline": "30-60 mins"}]'::jsonb,
'[{"name": "Banking Backup Procedures", "url": "/docs/banking-backup.pdf"}, {"name": "Manual Payment SOPs", "url": "/docs/manual-payments.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Customer Service Continuity Plan', 'Ensuring uninterrupted customer service during office closures, strikes, or natural disasters', 'Customer Support', 'Operations', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 1, 0, 'Active', 'Tested',
ARRAY['Remote work infrastructure', 'Call center backup', 'Social media monitoring'],
'[{"action": "Activate remote customer service", "owner": "Customer Success", "timeline": "0-30 mins"}, {"action": "Redirect calls to backup center", "owner": "Telecom Admin", "timeline": "30-45 mins"}, {"action": "Scale social media support", "owner": "Digital Team", "timeline": "0-60 mins"}]'::jsonb,
'[{"name": "Remote CS Setup Guide", "url": "/docs/remote-cs.pdf"}, {"name": "Call Center Backup SLA", "url": "/docs/backup-center-sla.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Supply Chain Disruption Plan', 'Plan for managing supply chain disruptions including port delays, currency issues, and vendor failures', 'Supply Chain Management', 'Operations', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 24, 4, 'Needs Review', 'Not Tested',
ARRAY['Alternative suppliers', 'Local sourcing options', 'Inventory buffers'],
'[{"action": "Activate alternative suppliers", "owner": "Procurement", "timeline": "0-4 hours"}, {"action": "Increase local sourcing", "owner": "Supply Chain", "timeline": "4-24 hours"}, {"action": "Release safety stock", "owner": "Warehouse", "timeline": "0-2 hours"}]'::jsonb,
'[{"name": "Supplier Contact Directory", "url": "/docs/supplier-contacts.pdf"}, {"name": "Local Sourcing Guide", "url": "/docs/local-sourcing.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87'),

('Regulatory Compliance Continuity', 'Maintaining regulatory compliance during disruptions including CBN, SEC, and FIRS reporting requirements', 'Regulatory Compliance', 'Compliance', 'd364a9ad-0ab0-432a-a333-37518a8d2b87', 8, 2, 'Active', 'Needs Testing',
ARRAY['Backup compliance systems', 'External compliance partners', 'Regulatory liaison contacts'],
'[{"action": "Activate backup compliance portal", "owner": "Compliance Officer", "timeline": "0-2 hours"}, {"action": "Engage external compliance support", "owner": "Legal Team", "timeline": "2-4 hours"}, {"action": "Notify regulatory bodies", "owner": "Regulatory Affairs", "timeline": "0-4 hours"}]'::jsonb,
'[{"name": "CBN Emergency Contacts", "url": "/docs/cbn-contacts.pdf"}, {"name": "Compliance Backup Procedures", "url": "/docs/compliance-backup.pdf"}]'::jsonb,
'd364a9ad-0ab0-432a-a333-37518a8d2b87');
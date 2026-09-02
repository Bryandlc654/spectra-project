CREATE TABLE IF NOT EXISTS `system_role_permissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `role_key` VARCHAR(50) NOT NULL,
  `module` VARCHAR(50) NOT NULL,
  UNIQUE KEY `unique_role_module` (`role_key`, `module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `system_role_permissions` (`role_key`, `module`) VALUES
-- Company Admin
('company_admin', 'dashboard'),
('company_admin', 'profile'),
('company_admin', 'payroll'),
('company_admin', 'contracts'),
('company_admin', 'documents'),
('company_admin', 'time_off'),
('company_admin', 'expenses'),
('company_admin', 'team'),
('company_admin', 'projects'),
('company_admin', 'timesheets'),
('company_admin', 'procurement'),
('company_admin', 'nps_dashboard'),
('company_admin', 'tenants'),
('company_admin', 'onboarding'),
('company_admin', 'offboarding'),
('company_admin', 'compliance'),
('company_admin', 'offboarding_admin'),
('company_admin', 'nps_survey'),
('company_admin', 'settings'),
-- Freelancer
('freelancer', 'dashboard'),
('freelancer', 'profile'),
('freelancer', 'contracts'),
('freelancer', 'expenses'),
('freelancer', 'timesheets'),
('freelancer', 'support'),
-- User
('user', 'dashboard'),
('user', 'profile'),
('user', 'time_off'),
('user', 'documents'),
('user', 'benefits'),
('user', 'payslips');

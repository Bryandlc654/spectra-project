import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import SessionExpiredModal from './components/SessionExpiredModal';
import { ToastProvider } from './components/ToastProvider';
import { PLATFORM_ROLES, setDynamicPermissions, hasAccess } from './lib/platformRoles';
import { useAuth } from './context/AuthContext';
import { resolveApiUrl } from './lib/api';
import PageLoading from './components/PageLoading';

// Lazy load pages & layouts
const AuthPage = lazy(() => import('./AuthPage'));
const SigningCompletePage = lazy(() => import('./pages/SigningCompletePage'));
const SignContractPage = lazy(() => import('./pages/SignContractPage'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const CompanyDashboard = lazy(() => import('./pages/CompanyDashboard'));
const FreelancerDashboard = lazy(() => import('./pages/FreelancerDashboard'));
const SupportDashboard = lazy(() => import('./pages/SupportDashboard'));
const SupportTicketsPage = lazy(() => import('./pages/Support/SupportTicketsPage'));
const KnowledgeBasePage = lazy(() => import('./pages/Support/KnowledgeBasePage'));
const SupportChatInbox = lazy(() => import('./pages/Support/SupportChatInbox'));
const SupportCompaniesView = lazy(() => import('./pages/Support/SupportCompaniesView'));
const SupportUsersView = lazy(() => import('./pages/Support/SupportUsersView'));
const SupportOnboardingView = lazy(() => import('./pages/Support/SupportOnboardingView'));
const SupportPaymentsView = lazy(() => import('./pages/Support/SupportPaymentsView'));
const SupportContractsView = lazy(() => import('./pages/Support/SupportContractsView'));
const SupportModerationView = lazy(() => import('./pages/Support/SupportModerationView'));
const SupportAuditView = lazy(() => import('./pages/Support/SupportAuditView'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const TenantsListPage = lazy(() => import('./pages/Tenants/TenantsListPage'));
const TenantsSubscriptionPage = lazy(() => import('./pages/Tenants/TenantsSubscriptionPage'));
const CreateTenantPage = lazy(() => import('./pages/Tenants/CreateTenantPage'));
const TenantDetailPage = lazy(() => import('./pages/Tenants/TenantDetailPage'));
const TenantLayout = lazy(() => import('./pages/Tenants/TenantLayout'));
const TenantOverviewPage = lazy(() => import('./pages/Tenants/TenantOverviewPage'));
const TenantSettingsPage = lazy(() => import('./pages/Tenants/TenantSettingsPage'));
const TenantRolesPage = lazy(() => import('./pages/Tenants/TenantRolesPage'));
const GenericTenantPage = lazy(() => import('./pages/Tenants/GenericTenantPage'));

const TenantFeesTab = lazy(() => import('./pages/Tenants/tabs/TenantFeesTab'));
const TenantContactsTab = lazy(() => import('./pages/Tenants/tabs/TenantContactsTab'));
const TenantWalletTab = lazy(() => import('./pages/Tenants/tabs/TenantWalletTab'));
const TenantInvoicesTab = lazy(() => import('./pages/Tenants/tabs/TenantInvoicesTab'));
const TenantPayrollTab = lazy(() => import('./pages/Tenants/tabs/TenantPayrollTab'));
const TenantProjectsTab = lazy(() => import('./pages/Tenants/tabs/TenantProjectsTab'));
const TenantContractsTab = lazy(() => import('./pages/Tenants/tabs/TenantContractsTab'));
const TenantContractTemplatesTab = lazy(() => import('./pages/Tenants/tabs/TenantContractTemplatesTab'));
const TenantMembersTab = lazy(() => import('./pages/Tenants/tabs/TenantMembersTab'));
const TenantAuditTab = lazy(() => import('./pages/Tenants/tabs/TenantAuditTab'));
const TenantKYBTab = lazy(() => import('./pages/Tenants/tabs/TenantKYBTab'));
const TenantSupportTab = lazy(() => import('./pages/Tenants/tabs/TenantSupportTab'));
const TenantOnboardingOpsTab = lazy(() => import('./pages/Tenants/tabs/TenantOnboardingOpsTab'));
const TenantGeneralTab = lazy(() => import('./pages/Tenants/tabs/TenantGeneralTab'));
const TenantApprovalsTab = lazy(() => import('./pages/Tenants/tabs/TenantApprovalsTab'));
const TenantFinanceTab = lazy(() => import('./pages/Tenants/tabs/TenantFinanceTab'));
const TenantIntegrationTab = lazy(() => import('./pages/Tenants/tabs/TenantIntegrationTab'));
const TenantReportsTab = lazy(() => import('./pages/Tenants/tabs/TenantReportsTab'));

const CompanyManagementPage = lazy(() => import('./pages/Company/CompanyManagementPage'));
const CompanyUsersPage = lazy(() => import('./pages/Company/CompanyUsersPage'));
const CompanyOnboardingPage = lazy(() => import('./pages/Company/CompanyOnboardingPage'));
const CompanyFreelancersPage = lazy(() => import('./pages/Company/CompanyFreelancersPage'));
const CompanyContractsPage = lazy(() => import('./pages/Company/CompanyContractsPage'));
const CompanyPayrollPage = lazy(() => import('./pages/Company/CompanyPayrollPage'));
const CompanyWalletPage = lazy(() => import('./pages/Company/CompanyWalletPage'));
const CompanyInvoicesPage = lazy(() => import('./pages/Company/CompanyInvoicesPage'));
const CompanyReportsPage = lazy(() => import('./pages/Reports/CompanyReportsPage'));
const CompanyAuditPage = lazy(() => import('./pages/Company/CompanyAuditPage'));

const FreelancersRoutes = lazy(() => import('./pages/Freelancers/FreelancersRoutes'));
const FreelancerProjectsPage = lazy(() => import('./pages/FreelancerProjectsPage'));
const FreelancerProjectDetailPage = lazy(() => import('./pages/FreelancerProjectDetailPage'));
const FreelancerContractsPage = lazy(() => import('./pages/FreelancerContractsPage'));
const FreelancerPaymentPage = lazy(() => import('./pages/FreelancerPaymentPage'));
const FreelancerNetSalaryPage = lazy(() => import('./pages/FreelancerNetSalaryPage'));

const UsersRoutes = lazy(() => import('./pages/Users/UsersRoutes'));
const RBACRoutes = lazy(() => import('./pages/RBAC/RBACRoutes'));
const KYBRoutes = lazy(() => import('./pages/KYB/KYBRoutes'));
const AuditLogsPage = lazy(() => import('./pages/Audit/AuditLogsPage'));
const FinanceRoutes = lazy(() => import('./pages/Finance/FinanceRoutes'));
const RequisitionsPage = lazy(() => import('./pages/Procurement/RequisitionsPage'));
const VendorsPage = lazy(() => import('./pages/Procurement/VendorsPage'));
const TimesheetsPage = lazy(() => import('./pages/Timesheets/TimesheetsPage'));
const ProjectsPage = lazy(() => import('./pages/Projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/Projects/ProjectDetailPage'));
const CountriesPage = lazy(() => import('./pages/Settings/CountriesPage'));
const CurrenciesPage = lazy(() => import('./pages/Settings/CurrenciesPage'));
const TimezonesPage = lazy(() => import('./pages/Settings/TimezonesPage'));
const SystemAuthPage = lazy(() => import('./pages/Settings/SystemAuthPage'));
const SystemSmtpPage = lazy(() => import('./pages/Settings/SystemSmtpPage'));
const SystemSettingsPage = lazy(() => import('./pages/Settings/SystemSettingsPage'));
const NotificationsPage = lazy(() => import('./pages/Settings/NotificationsPage'));
const SessionsPage = lazy(() => import('./pages/Security/SessionsPage'));
const GlobalContractTemplatesPage = lazy(() => import('./pages/Contracts/GlobalContractTemplatesPage'));
const ContractsListPage = lazy(() => import('./pages/Contracts/ContractsListPage'));
const EnvelopesPage = lazy(() => import('./pages/Contracts/EnvelopesPage'));
const SalaryAdvancesPage = lazy(() => import('./pages/Finance/SalaryAdvancesPage'));
const DeelCardsPage = lazy(() => import('./pages/Finance/DeelCardsPage'));
const PerformancePage = lazy(() => import('./pages/Performance/PerformancePage'));
const ExpensesPage = lazy(() => import('./pages/Expenses/ExpensesPage'));
const WithdrawalMethodsPage = lazy(() => import('./pages/WithdrawalMethodsPage'));
const BenefitsPlansPage = lazy(() => import('./pages/Benefits/BenefitsPlansPage'));
const PayrollDeductionsPage = lazy(() => import('./pages/Payroll/PayrollDeductionsPage'));
const VisaApplicationsPage = lazy(() => import('./pages/Immigration/VisaApplicationsPage'));
const LegalEntitiesPage = lazy(() => import('./pages/LegalEntities/LegalEntitiesPage'));
const EquipmentPage = lazy(() => import('./pages/Equipment/EquipmentPage'));
const EmployeeDocumentsPage = lazy(() => import('./pages/Documents/EmployeeDocumentsPage'));
const CompliancePage = lazy(() => import('./pages/Compliance/CompliancePage'));
const ComplianceAdminPage = lazy(() => import('./pages/Compliance/ComplianceAdminPage'));
const PayrollRunsPage = lazy(() => import('./pages/Payroll/PayrollRunsPage'));
const PayrollRunDetailPage = lazy(() => import('./pages/Payroll/PayrollRunDetailPage'));
const PayslipPage = lazy(() => import('./pages/Payroll/PayslipPage'));
const TimeOffPage = lazy(() => import('./pages/TimeOff/TimeOffPage'));
const GlobalCostReportsPage = lazy(() => import('./pages/Reports/GlobalCostReportsPage'));
const OnboardingPage = lazy(() => import('./pages/Onboarding/OnboardingPage'));
const AdminOnboardingPage = lazy(() => import('./pages/Onboarding/AdminOnboardingPage'));
const OffboardingPage = lazy(() => import('./pages/Onboarding/OffboardingPage'));
const AdminOffboardingPage = lazy(() => import('./pages/Onboarding/AdminOffboardingPage'));
const BackgroundChecksPage = lazy(() => import('./pages/Onboarding/BackgroundChecksPage'));
const ManagerTeamPage = lazy(() => import('./pages/Manager/ManagerTeamPage'));
const OrgChartPage = lazy(() => import('./pages/OrgChart/OrgChartPage'));
const TaxFormsPage = lazy(() => import('./pages/Compliance/TaxFormsPage'));
const LaborLawAlertsPage = lazy(() => import('./pages/Compliance/LaborLawAlertsPage'));
const NpsSurveyPage = lazy(() => import('./pages/Nps/NpsSurveyPage'));
const NpsDashboardPage = lazy(() => import('./pages/Nps/NpsDashboardPage'));

function RoleRoute({ user, section, children }) {
  if (!user) return <Navigate to="/auth" replace />;
  // Pass user.roles (array) as tenantRoles for granular checks
  if (user.platform_role === PLATFORM_ROLES.SUPPORT && section === 'support') {
    return children;
  }
  if (!hasAccess(user.platform_role || user.role, section, user.roles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  const { session, login, logout: onLogout, token } = useAuth();
  const apiUrl = resolveApiUrl();
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    const handleSessionExpired = () => {
      setIsSessionExpired(true);
    };

    window.addEventListener('spectra:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('spectra:session-expired', handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setDynamicPermissions(null);
      return;
    }
    fetch(`${apiUrl}/api/roles/system/permissions`, {
      headers: { Authorization: `Bearer ${session.token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setDynamicPermissions(data);
      })
      .catch(() => {});
  }, [session?.token, apiUrl]);

  const handleSessionExpiredConfirm = () => {
    setIsSessionExpired(false);
    
    // 1. Intentar logout via context (limpia estado y hace llamada API si es posible)
    try {
        if (onLogout) onLogout();
    } catch (e) {
        console.error('Logout error:', e);
    }

    // 2. Asegurar limpieza local por si acaso
    try {
        localStorage.removeItem('spectra_session');
        localStorage.removeItem('spectra_original_session');
    } catch {}

    // 3. Forzar redirección y recarga completa
    window.location.replace('/auth');
  };

  return (
    <>
      <SessionExpiredModal 
        open={isSessionExpired} 
        onConfirm={handleSessionExpiredConfirm} 
      />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route
            path="/auth"
            element={
              <AuthPage
                apiUrl={apiUrl}
                existingSession={session}
                onAuth={(newSession) => login(newSession)}
              />
            }
          />

          <Route
            path="/auth/reset-password"
            element={
              <AuthPage
                apiUrl={apiUrl}
                existingSession={session}
                onAuth={(newSession) => login(newSession)}
              />
            }
          />
          
          <Route path="/signing-complete" element={<SigningCompletePage />} />

          {/* Portal público de firma (Spectra Sign): sin autenticación, acceso por token */}
          <Route
            path="/sign/:token"
            element={<SignContractPage apiUrl={apiUrl} />}
          />

          <Route
            path="/dashboard"
            element={
              session ? (
                <DashboardLayout 
                    user={session.user} 
                    onLogout={onLogout} 
                    token={session.token}
                    apiUrl={apiUrl}
                />
              ) : (
                <Navigate to="/auth" replace />
              )
            }
          >
            <Route
              index
              element={
                session?.user?.platform_role === PLATFORM_ROLES.SUPPORT ? (
                  <SupportDashboard
                    user={session?.user}
                    apiUrl={apiUrl}
                    token={session?.token}
                  />
                ) : (
                  <DashboardHome
                    user={session?.user}
                    apiUrl={apiUrl}
                    token={session?.token}
                  />
                )
              }
            />
            <Route
              path="company-management"
              element={
                <RoleRoute user={session?.user} section="company_tenant_management">
                  <CompanyManagementPage />
                </RoleRoute>
              }
            >
              <Route path="users" element={<CompanyUsersPage />} />
              <Route path="onboarding" element={<CompanyOnboardingPage />} />
              <Route path="freelancers" element={<CompanyFreelancersPage />} />
              <Route path="contracts" element={<CompanyContractsPage />} />
            </Route>

            <Route
              path="billing"
              element={
                <RoleRoute user={session?.user} section="company_billing">
                  <Outlet />
                </RoleRoute>
              }
            >
              <Route index element={<Navigate to="invoices" replace />} />
              <Route path="invoices" element={<CompanyInvoicesPage />} />
              <Route path="payments" element={<CompanyWalletPage />} />
            </Route>

            <Route
              path="payroll"
              element={
                <RoleRoute user={session?.user} section="company_payroll">
                  <CompanyPayrollPage />
                </RoleRoute>
              }
            />

            <Route
              path="company-reports"
              element={
                <RoleRoute user={session?.user} section="company_reports">
                  <CompanyReportsPage />
                </RoleRoute>
              }
            />

            <Route
              path="company-audit"
              element={
                <RoleRoute user={session?.user} section="company_audit">
                  <CompanyAuditPage />
                </RoleRoute>
              }
            />
            <Route path="profile">
              <Route index element={<ProfilePage apiUrl={apiUrl} token={session?.token} />} />
              <Route
                path="withdrawal-methods"
                element={
                  <RoleRoute user={session?.user} section="withdrawal_methods">
                    <WithdrawalMethodsPage apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />
              <Route
                path="advances"
                element={
                  <RoleRoute user={session?.user} section="advances">
                    <SalaryAdvancesPage apiUrl={apiUrl} token={session?.token} user={session?.user} />
                  </RoleRoute>
                }
              />
              <Route
                path="cards"
                element={
                  <RoleRoute user={session?.user} section="cards">
                    <DeelCardsPage apiUrl={apiUrl} token={session?.token} user={session?.user} />
                  </RoleRoute>
                }
              />
            </Route>
            <Route
              path="tenants"
              element={
                <RoleRoute user={session?.user} section="tenants">
                  <TenantsListPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="tenants/create"
              element={
                <RoleRoute user={session?.user} section="tenants">
                  <CreateTenantPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="tenants/subscription"
              element={
                <RoleRoute user={session?.user} section="tenants">
                  <TenantsSubscriptionPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="tenants/:id"
              element={
                <RoleRoute user={session?.user} section="tenants">
                  <TenantLayout apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            >
                <Route index element={<TenantOverviewPage />} />
                <Route path="settings" element={<TenantSettingsPage />} />
                <Route path="roles" element={<TenantRolesPage />} />
                
                <Route path="fees" element={<GenericTenantPage Component={TenantFeesTab} />} />
                <Route path="contacts" element={<GenericTenantPage Component={TenantContactsTab} />} />
                <Route path="wallet" element={<GenericTenantPage Component={TenantWalletTab} />} />
                <Route path="invoices" element={<GenericTenantPage Component={TenantInvoicesTab} />} />
                <Route path="payroll" element={<GenericTenantPage Component={TenantPayrollTab} />} />
                <Route path="projects" element={<GenericTenantPage Component={TenantProjectsTab} />} />
                <Route path="contracts" element={<GenericTenantPage Component={TenantContractsTab} />} />
                <Route path="contracts/templates" element={<GenericTenantPage Component={TenantContractTemplatesTab} />} />
                <Route path="members" element={<GenericTenantPage Component={TenantMembersTab} />} />
                <Route path="audit" element={<GenericTenantPage Component={TenantAuditTab} />} />
                <Route path="kyb" element={<GenericTenantPage Component={TenantKYBTab} />} />
                <Route path="support" element={<GenericTenantPage Component={TenantSupportTab} />} />
                <Route path="onboarding-ops" element={<GenericTenantPage Component={TenantOnboardingOpsTab} />} />
                <Route path="reports" element={<GenericTenantPage Component={TenantReportsTab} />} />
            </Route>
            <Route
              path="admins/*"
              element={
                <RoleRoute user={session?.user} section="admins">
                  <UsersRoutes apiUrl={apiUrl} token={session?.token} roleScope="internal" />
                </RoleRoute>
              }
            />
            <Route path="security/sessions" element={
                <RoleRoute user={session?.user} section="admins">
                   <SessionsPage apiUrl={apiUrl} token={session?.token} currentUser={session?.user} />
                </RoleRoute>
              } />
            <Route
              path="company-users"
              element={
                <RoleRoute user={session?.user} section="company_internal_users">
                  <CompanyUsersPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="company-onboarding"
              element={
                <RoleRoute user={session?.user} section="company_onboarding">
                  <CompanyOnboardingPage apiUrl={apiUrl} />
                </RoleRoute>
              }
            />
            <Route
              path="company-freelancers"
              element={
                <RoleRoute user={session?.user} section="company_talent">
                  <CompanyFreelancersPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="company-contracts"
              element={
                <RoleRoute user={session?.user} section="company_contracts">
                  <CompanyContractsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
            path="freelancers/*"
            element={
              <RoleRoute user={session?.user} section="freelancers">
                <FreelancersRoutes apiUrl={apiUrl} token={session?.token} user={session?.user} />
              </RoleRoute>
            }
          />
            <Route
              path="payment-settings"
              element={
                <RoleRoute user={session?.user} section="freelancer">
                  <FreelancerPaymentPage />
                </RoleRoute>
              }
            />
            <Route
              path="net-salary"
              element={
                <RoleRoute user={session?.user} section={session?.user?.platform_role === 'company_admin' ? 'company_payroll' : 'freelancer'}>
                  <FreelancerNetSalaryPage />
                </RoleRoute>
              }
            />
            <Route
              path="contracts/templates"
              element={
                <RoleRoute user={session?.user} section="contracts_templates">
                  <GlobalContractTemplatesPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
            path="contracts"
            element={
              <RoleRoute user={session?.user} section="contracts">
                <ContractsListPage apiUrl={apiUrl} token={session?.token} />
              </RoleRoute>
            }
          />
            <Route
              path="contracts/envelopes"
              element={
                <RoleRoute user={session?.user} section="contracts_envelopes">
                  <EnvelopesPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="nps/survey"
              element={
                <RoleRoute user={session?.user} section="nps_survey">
                  <NpsSurveyPage />
                </RoleRoute>
              }
            />
            <Route
              path="nps/dashboard"
              element={
                <RoleRoute user={session?.user} section="nps_dashboard">
                  <NpsDashboardPage />
                </RoleRoute>
              }
            />

            <Route
              path="rbac/*"
              element={
                <RoleRoute user={session?.user} section="rbac">
                  <RBACRoutes apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="kyb/*"
              element={
                <RoleRoute user={session?.user} section="kyb">
                  <KYBRoutes apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
                path="finance/*"
                element={
                  <RoleRoute user={session?.user} section="finance">
                    <FinanceRoutes apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />
              <Route
            path="projects"
            element={
              session?.user?.platform_role === 'freelancer' || session?.user?.platform_role === 'freelance' ? (
                <RoleRoute user={session?.user} section="freelancer_projects">
                  <FreelancerProjectsPage user={session?.user} apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              ) : (
                <RoleRoute user={session?.user} section="projects">
                  <ProjectsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              )
            }
          />
          <Route
            path="projects/:id"
            element={
              session?.user?.platform_role === 'freelancer' || session?.user?.platform_role === 'freelance' ? (
                <RoleRoute user={session?.user} section="freelancer_projects">
                  <FreelancerProjectDetailPage user={session?.user} apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              ) : (
                <RoleRoute user={session?.user} section="projects">
                  <ProjectDetailPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              )
            }
          />
              <Route
                path="timesheets"
                element={
                  <RoleRoute user={session?.user} section="timesheets">
                    <TimesheetsPage apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />
              <Route
                path="procurement/vendors"
                element={
                  <RoleRoute user={session?.user} section="procurement">
                    <VendorsPage apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />
              <Route
                path="procurement/requisitions"
                element={
                  <RoleRoute user={session?.user} section="procurement">
                    <RequisitionsPage apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />
            <Route
              path="audit"
              element={
                <RoleRoute user={session?.user} section="audit">
                  <AuditLogsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="settings/system"
              element={
                <RoleRoute user={session?.user} section="settings">
                  <SystemSettingsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="settings/notifications"
              element={
                <RoleRoute user={session?.user} section="settings">
                  <NotificationsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="settings/countries"
              element={
                <RoleRoute user={session?.user} section="settings">
                  <CountriesPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="settings/currencies"
              element={
                <RoleRoute user={session?.user} section="settings">
                  <CurrenciesPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route 
              path="settings/timezones" 
              element={
                <RoleRoute user={session?.user} section="settings">
                  <TimezonesPage apiUrl={apiUrl} token={session?.token}  />
                </RoleRoute>
              } 
            />
            <Route 
              path="settings/auth" 
              element={
                <RoleRoute user={session?.user} section="admins">
                  <SystemAuthPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              } 
            />
            <Route 
              path="settings/smtp" 
              element={
                <RoleRoute user={session?.user} section="admins">
                  <SystemSmtpPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              } 
            />

            <Route
              path="benefits/plans"
              element={
                <RoleRoute user={session?.user} section="benefits">
                  <BenefitsPlansPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="payroll/deductions"
              element={
                <RoleRoute user={session?.user} section="payroll">
                  <PayrollDeductionsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="payroll/runs"
              element={
                <RoleRoute user={session?.user} section="payroll">
                  <PayrollRunsPage apiUrl={apiUrl} token={session?.token} companyId={session?.user?.company_id} />
                </RoleRoute>
              }
            />

            <Route
              path="payroll/runs/:id"
              element={
                <RoleRoute user={session?.user} section="payroll">
                  <PayrollRunDetailPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="payroll/runs/:id/payslip/:userId"
              element={
                <RoleRoute user={session?.user} section="payslips">
                  <PayslipPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="immigration/visas"
              element={
                <RoleRoute user={session?.user} section="immigration">
                  <VisaApplicationsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="legal-entities"
              element={
                <RoleRoute user={session?.user} section="legal_entities">
                  <LegalEntitiesPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="time-off"
              element={
                <RoleRoute user={session?.user} section="time_off">
                  <TimeOffPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="equipment"
              element={
                <RoleRoute user={session?.user} section="equipment">
                  <EquipmentPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="integrations"
              element={
                <RoleRoute user={session?.user} section="integrations">
                  <div className="p-6">
                     <h1 className="text-2xl font-bold mb-4">Integraciones y Aprovisionamiento</h1>
                     <p className="text-gray-600">Panel para IT Admins: Gestión de SSO, SCIM y App Provisioning.</p>
                     {/* Placeholder for future implementation */}
                  </div>
                </RoleRoute>
              }
            />
            <Route
              path="documents"
              element={
                <RoleRoute user={session?.user} section="employee_documents">
                  <EmployeeDocumentsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
                path="performance"
                element={
                  <RoleRoute user={session?.user} section="performance">
                    <PerformancePage apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />

              <Route
                path="expenses"
                element={
                  <RoleRoute user={session?.user} section="expenses">
                    <ExpensesPage apiUrl={apiUrl} token={session?.token} />
                  </RoleRoute>
                }
              />

            <Route
              path="compliance"
              element={
                <RoleRoute user={session?.user} section="compliance">
                  <CompliancePage apiUrl={apiUrl} token={session?.token} user={session?.user} />
                </RoleRoute>
              }
            />
            <Route
              path="compliance/admin"
              element={
                <RoleRoute user={session?.user} section="compliance">
                  <ComplianceAdminPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="reports/global-costs"
              element={
                <RoleRoute user={session?.user} section="reports">
                  <GlobalCostReportsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="onboarding"
              element={
                <RoleRoute user={session?.user} section="onboarding">
                  <OnboardingPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="onboarding/admin"
              element={
                <RoleRoute user={session?.user} section="onboarding_admin">
                  <AdminOnboardingPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="offboarding"
              element={
                <RoleRoute user={session?.user} section="offboarding">
                  <OffboardingPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="offboarding/admin"
              element={
                <RoleRoute user={session?.user} section="offboarding_admin">
                  <AdminOffboardingPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="onboarding/background-checks"
              element={
                <RoleRoute user={session?.user} section="background_checks">
                  <BackgroundChecksPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="compliance/alerts"
              element={
                <RoleRoute user={session?.user} section="compliance">
                  <LaborLawAlertsPage apiUrl={apiUrl} token={session?.token} user={session?.user} />
                </RoleRoute>
              }
            />
            <Route
              path="compliance/tax-forms"
              element={
                <RoleRoute user={session?.user} section="compliance">
                  <TaxFormsPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="org-chart"
              element={
                <RoleRoute user={session?.user} section="org_chart">
                  <OrgChartPage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />

            <Route
              path="team"
              element={
                <RoleRoute user={session?.user} section="team">
                  <ManagerTeamPage apiUrl={apiUrl} token={session?.token} user={session?.user} />
                </RoleRoute>
              }
            />

            <Route
              path="support/tickets"
              element={
                <RoleRoute user={session?.user} section="support_tickets">
                  <SupportTicketsPage apiUrl={apiUrl} token={session?.token} user={session?.user} />
                </RoleRoute>
              }
            />
            <Route
              path="support/empresas"
              element={
                <RoleRoute user={session?.user} section="support_companies">
                  <SupportCompaniesView apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/users"
              element={
                <RoleRoute user={session?.user} section="support_users">
                  <SupportUsersView apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/onboarding"
              element={
                <RoleRoute user={session?.user} section="support_onboarding">
                  <SupportOnboardingView />
                </RoleRoute>
              }
            />
            <Route
              path="support/payments"
              element={
                <RoleRoute user={session?.user} section="support_payments">
                  <SupportPaymentsView apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/contracts"
              element={
                <RoleRoute user={session?.user} section="support_contracts">
                  <SupportContractsView apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/moderation"
              element={
                <RoleRoute user={session?.user} section="support_moderation">
                  <SupportModerationView apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/audit"
              element={
                <RoleRoute user={session?.user} section="support_audit">
                  <SupportAuditView apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/kb"
              element={
                <RoleRoute user={session?.user} section="support">
                  <KnowledgeBasePage apiUrl={apiUrl} token={session?.token} />
                </RoleRoute>
              }
            />
            <Route
              path="support/chat-inbox"
              element={
                <RoleRoute user={session?.user} section="support">
                  <SupportChatInbox apiUrl={apiUrl} />
                </RoleRoute>
              }
            />

          </Route>

          <Route path="*" element={<Navigate to={session ? '/dashboard' : '/auth'} replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  );
}

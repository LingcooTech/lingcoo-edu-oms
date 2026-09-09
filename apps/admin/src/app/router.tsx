import { Flex, Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminShell } from '../layouts/AdminShell';
import { RequireSession } from '../features/identity/RequireSession';
import { RequirePermission } from '../features/access/PermissionContext';
import { ForbiddenPage, NotFoundPage, UnauthorizedPage } from '../routes/error-pages';

const DashboardPage = lazy(() =>
  import('../routes/dashboard-page').then((module) => ({ default: module.DashboardPage })),
);
const QuickActionsPage = lazy(() =>
  import('../routes/dashboard-page').then((module) => ({ default: module.QuickActionsPage })),
);
const ShowcasePage = lazy(() =>
  import('../routes/showcase-page').then((module) => ({ default: module.ShowcasePage })),
);
const LoginPage = lazy(() =>
  import('../features/identity/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../features/identity/PasswordResetPages').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import('../features/identity/PasswordResetPages').then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import('../features/identity/VerifyEmailPage').then((module) => ({
    default: module.VerifyEmailPage,
  })),
);
const AccountSecurityPage = lazy(() =>
  import('../features/identity/AccountSecurityPage').then((module) => ({
    default: module.AccountSecurityPage,
  })),
);
const ActiveSessionsPage = lazy(() =>
  import('../features/identity/ActiveSessionsPage').then((module) => ({
    default: module.ActiveSessionsPage,
  })),
);
const UsersPage = lazy(() =>
  import('../features/access/UsersPage').then((module) => ({ default: module.UsersPage })),
);
const RolesPage = lazy(() =>
  import('../features/access/RolesPage').then((module) => ({ default: module.RolesPage })),
);
const AuditPage = lazy(() =>
  import('../features/audit/AuditPage').then((module) => ({ default: module.AuditPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const IdempotencyPage = lazy(() =>
  import('../features/idempotency/IdempotencyPage').then((module) => ({
    default: module.IdempotencyPage,
  })),
);
const JobsPage = lazy(() =>
  import('../features/jobs/JobsPage').then((module) => ({ default: module.JobsPage })),
);
const OutboxPage = lazy(() =>
  import('../features/outbox/OutboxPage').then((module) => ({ default: module.OutboxPage })),
);
const MailPage = lazy(() =>
  import('../features/mail/MailPage').then((module) => ({ default: module.MailPage })),
);
const NotificationsPage = lazy(() =>
  import('../features/notifications/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
);
const AssetLibraryPage = lazy(() =>
  import('../features/storage/AssetLibraryPage').then((module) => ({
    default: module.AssetLibraryPage,
  })),
);
const BrandingPage = lazy(() =>
  import('../features/branding/BrandingPage').then((module) => ({
    default: module.BrandingPage,
  })),
);
const PaymentsPage = lazy(() =>
  import('../features/payments/PaymentsPage').then((module) => ({ default: module.PaymentsPage })),
);
const InstitutionsPage = lazy(() =>
  import('../features/organization/InstitutionsPage').then((module) => ({
    default: module.InstitutionsPage,
  })),
);
const OrganizationSettingsPage = lazy(() =>
  import('../features/organization/OrganizationSettingsPage').then((module) => ({
    default: module.OrganizationSettingsPage,
  })),
);
const StudentsPage = lazy(() =>
  import('../features/people/StudentsPage').then((module) => ({
    default: module.StudentsPage,
  })),
);
const TeachersPage = lazy(() =>
  import('../features/people/TeachersPage').then((module) => ({
    default: module.TeachersPage,
  })),
);
const TeachingResourcesPage = lazy(() =>
  import('../features/teaching-resources/TeachingResourcesPage').then((module) => ({
    default: module.TeachingResourcesPage,
  })),
);
const SchedulePlansPage = lazy(() =>
  import('../features/teaching-resources/SchedulePlansPage').then((module) => ({
    default: module.SchedulePlansPage,
  })),
);
const LessonPackagesPage = lazy(() =>
  import('../features/lessons/LessonPackagesPage').then((module) => ({
    default: module.LessonPackagesPage,
  })),
);
const LessonAccountsPage = lazy(() =>
  import('../features/lessons/LessonAccountsPage').then((module) => ({
    default: module.LessonAccountsPage,
  })),
);
const LessonSessionsPage = lazy(() =>
  import('../features/sessions/LessonSessionsPage').then((module) => ({
    default: module.LessonSessionsPage,
  })),
);

function RouteLoading() {
  return (
    <Flex justify="center" align="center" style={{ minHeight: 320 }}>
      <Spin size="large" description="加载页面" />
    </Flex>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireSession />}>
          <Route element={<AdminShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="quick-actions" element={<QuickActionsPage />} />
            <Route path="showcase" element={<ShowcasePage />} />
            <Route path="account/security" element={<AccountSecurityPage />} />
            <Route path="account/sessions" element={<ActiveSessionsPage />} />
            <Route element={<RequirePermission permissions={['education.institutions.read']} />}>
              <Route path="organization" element={<OrganizationSettingsPage />} />
              <Route path="institutions" element={<InstitutionsPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.students.read']} />}>
              <Route path="students" element={<StudentsPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.teachers.read']} />}>
              <Route path="teachers" element={<TeachersPage />} />
            </Route>
            <Route
              element={<RequirePermission permissions={['education.teaching-resources.read']} />}
            >
              <Route path="campuses" element={<TeachingResourcesPage initialTab="campuses" />} />
              <Route
                path="classrooms"
                element={<TeachingResourcesPage initialTab="classrooms" />}
              />
              <Route path="teaching-resources" element={<Navigate to="/courses" replace />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.courses.read']} />}>
              <Route path="courses" element={<TeachingResourcesPage initialTab="courses" />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.classes.read']} />}>
              <Route path="classes" element={<TeachingResourcesPage initialTab="classes" />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.sessions.read']} />}>
              <Route path="schedule-plans" element={<SchedulePlansPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.sessions.read']} />}>
              <Route path="lesson-sessions" element={<LessonSessionsPage mode="sessions" />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.attendance.read']} />}>
              <Route path="attendance" element={<LessonSessionsPage mode="attendance" />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.lesson-packages.read']} />}>
              <Route path="lesson-packages" element={<LessonPackagesPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['education.lesson-balances.read']} />}>
              <Route path="lesson-accounts" element={<LessonAccountsPage />} />
              <Route
                path="lesson-movements"
                element={<LessonAccountsPage initialTab="movements" />}
              />
            </Route>
            <Route element={<RequirePermission permissions={['accounts.read']} />}>
              <Route path="access/users" element={<UsersPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['roles.read']} />}>
              <Route path="access/roles" element={<RolesPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['audit.read']} />}>
              <Route path="audit" element={<AuditPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['settings.read']} />}>
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['idempotency.read']} />}>
              <Route path="idempotency" element={<IdempotencyPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['jobs.read']} />}>
              <Route path="jobs" element={<JobsPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['outbox.read']} />}>
              <Route path="outbox" element={<OutboxPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['mail.read']} />}>
              <Route path="mail" element={<MailPage />} />
            </Route>
            <Route path="notifications" element={<NotificationsPage />} />
            <Route element={<RequirePermission permissions={['storage.read']} />}>
              <Route path="storage" element={<AssetLibraryPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['branding.read']} />}>
              <Route path="branding" element={<BrandingPage />} />
            </Route>
            <Route element={<RequirePermission permissions={['payments.read']} />}>
              <Route path="payments" element={<PaymentsPage />} />
            </Route>
            <Route path="forbidden" element={<ForbiddenPage />} />
            <Route path="unauthorized" element={<UnauthorizedPage />} />
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

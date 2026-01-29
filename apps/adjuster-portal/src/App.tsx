import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { DashboardPage } from '@/pages/dashboard';
import { ClaimsListPage } from '@/pages/claims';
import { ClaimDetailPage } from '@/pages/claims/detail';
import { NewClaimPage } from '@/pages/claims/new';
import { UploadVideoPage } from '@/pages/claims/upload-video';
import { VideoReviewPage } from '@/pages/claims/video-review';
import { VideoCallPage } from '@/pages/video/call';
import { VideoSessionsPage } from '@/pages/sessions';
import { SessionDetailPage } from '@/pages/sessions/detail';
import { UploadDetailPage } from '@/pages/sessions/upload-detail';
import { SchedulePage } from '@/pages/schedule';
import { SettingsPage } from '@/pages/settings';
import { HelpPage } from '@/pages/help';
import { VehicleMakePage } from '@/pages/master-data/vehicle-make';
import { VehicleModelPage } from '@/pages/master-data/vehicle-model';
import { DocumentsListPage } from '@/pages/documents';
import { DocumentDetailPage } from '@/pages/documents/detail';
import { useAuthStore } from '@/stores/auth-store';
import { RoleRoute } from '@/components/auth/role-guard';
import { env } from '@/lib/env';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <RegisterPage />
                </PublicRoute>
              }
            />

            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/claims" element={<ClaimsListPage />} />
              <Route
                path="/claims/new"
                element={
                  <RoleRoute
                    allowedRoles={[
                      'ADJUSTER',
                      'FIRM_ADMIN',
                      'INSURER_ADMIN',
                      'INSURER_STAFF',
                      'SUPER_ADMIN',
                    ]}
                  >
                    <NewClaimPage />
                  </RoleRoute>
                }
              />
              <Route path="/claims/:id" element={<ClaimDetailPage />} />
              <Route path="/documents" element={<DocumentsListPage />} />
              <Route path="/documents/:id" element={<DocumentDetailPage />} />
              <Route
                path="/claims/:id/upload-video"
                element={
                  <RoleRoute allowedRoles={['ADJUSTER', 'SUPER_ADMIN']}>
                    <UploadVideoPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/claims/:id/video-review/:uploadId"
                element={
                  <RoleRoute allowedRoles={['ADJUSTER', 'SUPER_ADMIN']}>
                    <VideoReviewPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/video/:sessionId"
                element={
                  <RoleRoute allowedRoles={['ADJUSTER', 'SUPER_ADMIN']}>
                    <VideoCallPage />
                  </RoleRoute>
                }
              />
              <Route path="/sessions" element={<VideoSessionsPage />} />
              <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
              <Route path="/sessions/upload/:uploadId" element={<UploadDetailPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/master-data/vehicle-make"
                element={
                  <RoleRoute
                    allowedRoles={['ADJUSTER', 'FIRM_ADMIN', 'INSURER_ADMIN', 'SUPER_ADMIN']}
                  >
                    <VehicleMakePage />
                  </RoleRoute>
                }
              />
              <Route
                path="/master-data/vehicle-model"
                element={
                  <RoleRoute
                    allowedRoles={['ADJUSTER', 'FIRM_ADMIN', 'INSURER_ADMIN', 'SUPER_ADMIN']}
                  >
                    <VehicleModelPage />
                  </RoleRoute>
                }
              />
              <Route path="/help" element={<HelpPage />} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
        {env.enableDevtools && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

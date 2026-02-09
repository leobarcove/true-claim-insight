import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { WelcomePage } from '@/pages/welcome';
import { LoginPage } from '@/pages/login';
import { VerifyOtpPage } from '@/pages/verify-otp';
import { SubmitClaimPage } from '@/pages/claims/submit';
import { ClaimantVideoCallPage } from '@/pages/video/call';
import { VideoAssessmentWizard } from '@/pages/video/video-wizard';
import { ClaimDetailsPage } from '@/pages/claims/details';
import { useAuthStore } from '@/stores/auth-store';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    // Save the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

import { AssessmentTrackerPage } from '@/pages/tracker';

function App() {
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(darkModeMediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
    darkModeMediaQuery.addEventListener('change', listener);

    return () => darkModeMediaQuery.removeEventListener('change', listener);
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-muted/20 dark:bg-background/20 flex justify-center">
        <div className="w-full max-w-[480px] min-h-screen bg-background shadow-2xl relative flex flex-col border-x border-border/10">
          <div className="flex-1 safe-area-top safe-area-bottom">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<WelcomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/otp" element={<VerifyOtpPage />} />

              {/* Protected routes */}
              <Route
                path="/tracker"
                element={
                  <ProtectedRoute>
                    <AssessmentTrackerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/claims/submit"
                element={
                  <ProtectedRoute>
                    <SubmitClaimPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/claims/:id"
                element={
                  <ProtectedRoute>
                    <ClaimDetailsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/video/:sessionId">
                <Route
                  index
                  element={
                    <ProtectedRoute>
                      <ClaimantVideoCallPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="join"
                  element={
                    <ProtectedRoute>
                      <VideoAssessmentWizard />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/tracker" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;

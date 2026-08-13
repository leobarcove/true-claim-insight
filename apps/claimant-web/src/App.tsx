import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { WelcomePage } from '@/pages/welcome';
import { PublicChatPage } from '@/pages/chat';
import { LoginPage } from '@/pages/login';
import { VerifyOtpPage } from '@/pages/verify-otp';
import { SubmitClaimPage } from '@/pages/claims/submit';
import { CaseIntakePage } from '@/pages/cases/new';
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
      {/*
        The phone-shaped column every page renders inside.

        `h-dvh` rather than `min-h-screen`: a conversation page fills the
        viewport exactly and scrolls its own transcript, and a *minimum* height
        let the column grow past the screen so the composer sat below the fold.
        dvh over vh because mobile browser chrome moves.

        `min-h-0` on the content wrapper is the part that is easy to miss — a
        flex child will not shrink below its content without it, so the
        transcript would refuse to scroll and push the composer out of view.
      */}
      <div className="flex h-dvh justify-center bg-muted/20 dark:bg-background/20 sm:py-4">
        <div className="relative flex h-full w-full max-w-[480px] flex-col overflow-hidden border-border/10 bg-background shadow-2xl border-x sm:rounded-3xl sm:border">
          <div className="flex min-h-0 flex-1 flex-col safe-area-top safe-area-bottom">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<WelcomePage />} />
              {/* Public intake — no login. The web equivalent of messaging the
                  WhatsApp number: open the link and start talking. */}
              <Route path="/chat" element={<PublicChatPage />} />
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
                path="/cases/new"
                element={
                  <ProtectedRoute>
                    <CaseIntakePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases/:id"
                element={
                  <ProtectedRoute>
                    <CaseIntakePage />
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

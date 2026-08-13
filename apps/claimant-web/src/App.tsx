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

        THE FRAME HAS TO BE VISIBLE. The first attempt drew it with
        `border-border/10` on a `bg-background/20` backdrop — a ten-per-cent
        border between two near-identical dark surfaces, which is to say no
        frame at all. What makes a device read as a device is contrast with
        what surrounds it, so: a black surround, a solid 4px bezel, and a drop
        shadow. Tokens are avoided here on purpose — `border-border` follows
        the app's own theme and would keep disappearing into it.

        Only from `sm:` up. On a real phone the app IS the device; a bezel
        drawn around a screen that is already a screen just eats it.
      */}
      <div className="flex h-dvh justify-center bg-zinc-200 dark:bg-black sm:py-8">
        <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-background sm:rounded-[2.25rem] sm:border-4 sm:border-zinc-800 sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] sm:ring-1 sm:ring-black/60">
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

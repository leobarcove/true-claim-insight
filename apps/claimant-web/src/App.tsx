import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { CheckCircle2, Video, FileText, LogOut } from 'lucide-react';
import { WelcomePage } from '@/pages/welcome';
import { LoginPage } from '@/pages/login';
import { VerifyOtpPage } from '@/pages/verify-otp';
import { SubmitClaimPage } from '@/pages/claims/submit';
import { ClaimantVideoCallPage } from '@/pages/video/call';
import { VideoAssessmentWizard } from '@/pages/video/video-wizard';
import { useAuthStore } from '@/stores/auth-store';
import { useClaims, useClaimSessions } from '@/hooks/use-claims';
import { cn } from '@/lib/utils';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    // Save the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

// Simple assessment tracker component showing logged-in user
function AssessmentTrackerPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Fetch claimant's claims
  const { data: claimsData, isLoading: isLoadingClaims } = useClaims();
  const activeClaim = claimsData?.claims?.[0];

  // Fetch sessions for the active claim
  const { data: sessions } = useClaimSessions(activeClaim?.id || '');
  const activeSession = sessions?.find(s => s.status === 'ACTIVE' || s.status === 'SCHEDULED');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'ASSIGNED':
        return 'bg-secondary text-secondary-foreground';
      case 'SCHEDULED':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'IN_ASSESSMENT':
        return 'bg-primary/10 text-primary';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-background">
      <header className="bg-card px-6 py-4 border-b border-border flex justify-between items-center sticky top-0 z-10">
        <div className="font-bold text-primary flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-8 w-8" />
          True Claim
        </div>
        <button
          onClick={logout}
          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="flex-1 p-6 space-y-6 w-full">
        {/* Profile Card */}
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border transition-colors">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shadow-inner">
              👋
            </div>
            <div>
              <h2 className="font-bold text-xl text-foreground">Assistance required?</h2>
              <p className="text-sm text-muted-foreground font-medium">{user?.phoneNumber}</p>
            </div>
          </div>
        </div>

        {/* Claim Status Card */}
        <div className="space-y-4">
          <h3 className="font-bold text-muted-foreground flex items-center gap-2">
            <CheckCircle2 size={18} className="text-primary" />
            Active Case Status
          </h3>

          {isLoadingClaims ? (
            <div className="bg-card rounded-2xl p-8 border border-border flex flex-center justify-center">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : activeClaim ? (
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-colors">
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      Vehicle Plate
                    </div>
                    <div className="text-2xl font-black text-foreground tracking-tight">
                      {activeClaim.vehiclePlateNumber || 'N/A'}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                      getStatusColor(activeClaim.status)
                    )}
                  >
                    {activeClaim.status.replace('_', ' ')}
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <FileText size={16} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Claim Type</p>
                      <p className="text-xs text-muted-foreground">
                        {activeClaim.claimType.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                </div>

                {activeSession && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <button
                      onClick={() => navigate(`/video/${activeSession.id}/setup`)}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-4 rounded-xl flex items-center justify-center gap-3 font-bold transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
                    >
                      <Video size={20} fill="currentColor" />
                      Join Live Assessment
                    </button>
                    <p className="text-[10px] text-center text-primary font-bold mt-2 uppercase tracking-widest">
                      Adjuster is waiting for you
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-muted/30 border-t border-border flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-medium italic">
                  Case ID: {activeClaim.claimNumber || activeClaim.id}
                </span>
                <span className="text-xs text-primary font-bold">Details &rarr;</span>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl p-10 border-2 border-dashed border-border text-center space-y-3 transition-colors">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <FileText size={24} className="text-muted-foreground/30" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">
                No active cases found for this account.
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {/* <div className="space-y-4">
          <h3 className="font-bold text-gray-700">Self-Service</h3>
          <button
            onClick={() => navigate('/claims/submit')}
            className="w-full bg-white border border-gray-100 p-6 rounded-2xl flex flex-col items-center gap-3 hover:bg-gray-50 transition-all group"
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              ➕
            </div>
            <span className="font-bold text-gray-900">Notify New Incident</span>
            <p className="text-xs text-gray-400">File a new insurance claim</p>
          </button>
        </div> */}
      </main>
    </div>
  );
}

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
              <Route path="/verify-otp" element={<VerifyOtpPage />} />

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
                path="/video/:sessionId"
                element={
                  <ProtectedRoute>
                    <ClaimantVideoCallPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/video/:sessionId/setup"
                element={
                  <ProtectedRoute>
                    <VideoAssessmentWizard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/video/:sessionId/verify-nric"
                element={<Navigate to="../setup" replace />}
              />
              <Route
                path="/video/:sessionId/location"
                element={<Navigate to="../setup" replace />}
              />

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

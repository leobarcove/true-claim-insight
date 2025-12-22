import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, Video, FileText, LogOut } from 'lucide-react';
import { WelcomePage } from '@/pages/welcome';
import { LoginPage } from '@/pages/login';
import { VerifyOtpPage } from '@/pages/verify-otp';
import { SubmitClaimPage } from '@/pages/claims/submit';
import { ClaimantVideoCallPage } from '@/pages/video/call';
import { VerifyNRICPage } from '@/pages/video/verify-nric';
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
      case 'SUBMITTED': return 'bg-blue-100 text-blue-700';
      case 'ASSIGNED': return 'bg-purple-100 text-purple-700';
      case 'SCHEDULED': return 'bg-amber-100 text-amber-700';
      case 'IN_ASSESSMENT': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
        <div className="font-bold text-primary flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-black">TC</div>
          True Claim
        </div>
        <button onClick={logout} className="p-2 text-gray-400 hover:text-destructive transition-colors">
          <LogOut size={20} />
        </button>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-md mx-auto w-full">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shadow-inner">
              👋
            </div>
            <div>
              <h2 className="font-bold text-xl text-gray-900">Assistance required?</h2>
              <p className="text-sm text-gray-500 font-medium">{user?.phoneNumber}</p>
            </div>
          </div>
        </div>

        {/* Claim Status Card */}
        <div className="space-y-4">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-primary" />
            Active Case Status
          </h3>
          
          {isLoadingClaims ? (
            <div className="bg-white rounded-2xl p-8 border border-gray-100 flex flex-center justify-center">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : activeClaim ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Vehicle Plate</div>
                    <div className="text-2xl font-black text-gray-900 tracking-tight">{activeClaim.vehiclePlateNumber || 'N/A'}</div>
                  </div>
                  <div className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider", getStatusColor(activeClaim.status))}>
                    {activeClaim.status.replace('_', ' ')}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-50">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center">
                      <FileText size={16} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium">Claim Type</p>
                      <p className="text-xs text-gray-400">{activeClaim.claimType.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>

                {activeSession && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <button 
                      onClick={() => navigate(`/video/${activeSession.id}`)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl flex items-center justify-center gap-3 font-bold transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
                    >
                      <Video size={20} fill="currentColor" />
                      Join Live Assessment
                    </button>
                    <p className="text-[10px] text-center text-blue-500 font-bold mt-2 uppercase tracking-widest">
                      Adjuster is waiting for you
                    </p>
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs text-gray-400 font-medium italic">Case ID: {activeClaim.id.slice(0, 8)}...</span>
                <span className="text-xs text-primary font-bold">Details &rarr;</span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-10 border-2 border-dashed border-gray-100 text-center space-y-3">
              <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                <FileText size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-400 text-sm font-medium">No active cases found for this account.</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
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
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background safe-area-top safe-area-bottom">
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
            path="/video/:sessionId/verify-nric"
            element={
              <ProtectedRoute>
                <VerifyNRICPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/tracker" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;


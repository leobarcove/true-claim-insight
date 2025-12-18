import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { WelcomePage } from '@/pages/welcome';
import { LoginPage } from '@/pages/login';
import { VerifyOtpPage } from '@/pages/verify-otp';
import { SubmitClaimPage } from '@/pages/claims/submit';
import { ClaimantVideoCallPage } from '@/pages/video/call';
import { useAuthStore } from '@/stores/auth-store';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Simple dashboard component showing logged-in user
function DashboardPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-center">
        <div className="font-bold text-primary">True Claim</div>
        <button onClick={logout} className="text-sm text-destructive font-medium">Sign Out</button>
      </header>

      <main className="flex-1 p-6 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-xl">
              👤
            </div>
            <div>
              <h2 className="font-bold text-lg">Welcome back!</h2>
              <p className="text-sm text-gray-500">{user?.phoneNumber}</p>
            </div>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">KYC Status</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning uppercase">
              {user?.kycStatus || 'PENDING'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-gray-700">Quick Actions</h3>
          <button 
            onClick={() => navigate('/claims/submit')}
            className="w-full bg-primary text-primary-foreground p-6 rounded-2xl flex flex-col items-center gap-3 shadow-lg shadow-primary/20 hover:scale-[0.98] transition-all"
          >
            <PlusCircle size={32} />
            <span className="font-bold text-lg">Submit New Claim</span>
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
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
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

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;


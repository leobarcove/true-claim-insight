import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WelcomePage } from '@/pages/welcome';
import { LoginPage } from '@/pages/login';
import { VerifyOtpPage } from '@/pages/verify-otp';
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h1 className="text-2xl font-bold">Welcome!</h1>
        <p className="text-muted-foreground">
          You are logged in as
        </p>
        <p className="font-semibold text-lg">{user?.phoneNumber}</p>
        <p className="text-sm text-muted-foreground">
          KYC Status: <span className="font-medium">{user?.kycStatus || 'PENDING'}</span>
        </p>
      </div>
      <button
        onClick={logout}
        className="px-6 py-3 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
      >
        Sign Out
      </button>
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
            element={
              <ProtectedRoute>
                <DashboardPage />
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


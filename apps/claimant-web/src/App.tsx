import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WelcomePage } from '@/pages/welcome';
import { LoginPage } from '@/pages/login';
import { useAuthStore } from '@/stores/auth-store';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background safe-area-top safe-area-bottom">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes (placeholder for future) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div className="flex items-center justify-center min-h-screen">
                  <p className="text-lg">Dashboard coming soon...</p>
                </div>
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

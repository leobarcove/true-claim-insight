import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, ShieldCheck, AlertCircle, Loader2, ArrowRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

export function RequestLocationPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('prompt');

  useEffect(() => {
    // Check if NRIC verification in sessionStorage
    const isVerified = sessionStorage.getItem(`nric_verified_${sessionId}`) === 'true';

    if (!isVerified && sessionId) {
      navigate(`/video/${sessionId}/verify-nric`);
      return;
    }

    // Check if permission was already granted or denied
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' as any }).then(result => {
        setPermissionStatus(result.state);
        result.onchange = () => {
          setPermissionStatus(result.state);
        };
      });
    }
  }, [sessionId, navigate]);

  const getClientInfo = async (coords: GeolocationCoordinates) => {
    // Basic browser info
    const info: any = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: (navigator as any).platform,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    return info;
  };

  const handleRequestLocation = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          const clientInfo = await getClientInfo(position.coords);

          // Send to backend via gateway
          await apiClient.post(`/video/rooms/${sessionId}/client-info`, clientInfo);

          // Mark location as verified for this session
          sessionStorage.setItem(`location_verified_${sessionId}`, 'true');

          // Proceed to video call
          navigate(`/video/${sessionId}`);
        } catch (err: any) {
          console.error('Error saving client info:', err);
          setError('We could not securely verify your location. Please try again.');
        } finally {
          setLoading(false);
        }
      },
      err => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            'Location access was denied. You must allow location access to proceed with the assessment.'
          );
          setPermissionStatus('denied');
        } else {
          setError('Position unavailable. Please ensure your GPS is enabled and try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header Decor */}
        <div className="flex justify-center mb-8">
          <div className="bg-card p-4 rounded-3xl shadow-xl shadow-primary/10 border border-border transition-transform hover:scale-105 duration-300">
            <img src="/logo.png" alt="Logo" className="h-12 w-12" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-card rounded-[2.5rem] shadow-2xl shadow-slate-200/20 p-10 border border-border relative overflow-hidden">
          <div className="relative">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary mb-6">
                <MapPin className="w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
                Location Verification
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
                For security and regulatory compliance, we need to verify your current location
                before starting the video assessment.
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-muted/30 rounded-2xl p-5 border border-border flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 text-primary shadow-sm">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm mb-1">Secure & Required</h3>
                  <p className="text-xs text-muted-foreground leading-normal">
                    This step ensures the assessment is conducted within approved geographical
                    boundaries and protects against fraud.
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-4 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Access Denied</p>
                    <p className="text-xs leading-normal opacity-90">{error}</p>
                  </div>
                </div>
              )}

              {permissionStatus === 'denied' && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 px-4 py-4 rounded-2xl flex items-start gap-3">
                  <Info className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">How to fix this?</p>
                    <p className="text-xs leading-normal">
                      Please go to your browser settings, reset location permissions for this site,
                      and refresh this page to try again.
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleRequestLocation}
                className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] group"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>Enable Location</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Protected by True Claim Insight Security
          </p>
        </div>
      </div>
    </div>
  );
}

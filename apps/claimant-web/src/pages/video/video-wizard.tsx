import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Loader2, AlertCircle, LogOut, Smartphone, Info, User, Radius } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useVerifyNRIC } from '@/hooks/use-claimants';

// --- Helpers ---

const validateNRIC = (nric: string): { valid: boolean; error?: string } => {
  const digitsOnly = nric.replace(/\D/g, '');
  if (digitsOnly.length !== 12) {
    return { valid: false, error: 'NRIC must be 12 digits' };
  }
  const month = parseInt(digitsOnly.substring(2, 4), 10);
  const day = parseInt(digitsOnly.substring(4, 6), 10);
  if (month < 1 || month > 12) return { valid: false, error: 'Invalid month' };
  if (day < 1 || day > 31) return { valid: false, error: 'Invalid day' };
  return { valid: true };
};

const formatNRIC = (value: string): string => {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length <= 6) return digitsOnly;
  if (digitsOnly.length <= 8) return `${digitsOnly.substring(0, 6)}-${digitsOnly.substring(6)}`;
  return `${digitsOnly.substring(0, 6)}-${digitsOnly.substring(6, 8)}-${digitsOnly.substring(8, 12)}`;
};

const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1.5 align-middle">
    <Info className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors cursor-help" />
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-card text-foreground text-[11px] leading-relaxed rounded-xl shadow-xl border border-border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-border" />
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-card" />
    </div>
  </div>
);

const ErrorMessage = ({ message }: { message: string }) => (
  <p className="text-sm text-destructive mt-1 animate-in fade-in slide-in-from-top-1 ml-1 flex items-center gap-1.5">
    <AlertCircle className="w-3 h-3" />
    {message}
  </p>
);

// --- Component ---

export function VideoAssessmentWizard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [step, setStep] = useState(0);
  const [nric, setNric] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('prompt');

  const verifyNricMutation = useVerifyNRIC();

  const totalSteps = 3; // 0: Phone, 1: NRIC, 2: Location

  useEffect(() => {
    setError(null);
    if (navigator.permissions && step === 2) {
      navigator.permissions.query({ name: 'geolocation' as any }).then(result => {
        setPermissionStatus(result.state);
        result.onchange = () => {
          setPermissionStatus(result.state);
        };
      });
    }
  }, [step]);

  const handleNext = async () => {
    // Step 0: Phone Confirmation
    if (step === 0) {
      if (!user?.phoneNumber) {
        setError('Phone number not found. Please login again.');
        return;
      }
      setStep(1);
    }
    // Step 1: Identity (NRIC)
    else if (step === 1) {
      const validation = validateNRIC(nric);
      if (!validation.valid) {
        setError(validation.error || 'Invalid NRIC');
        return;
      }

      try {
        setLoading(true);
        const nricDigits = nric.replace(/\D/g, '');
        const phoneDigits = user!.phoneNumber.replace(/\D/g, '');
        await verifyNricMutation.mutateAsync({
          nric: nricDigits,
          phoneNumber: phoneDigits,
          sessionId: sessionId!,
        });

        sessionStorage.setItem(`nric_verified_${sessionId}`, 'true');
        setStep(2);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Verification failed. Please check your details.');
      } finally {
        setLoading(false);
      }
    }
    // Step 2: Security (Location)
    else if (step === 2) {
      handleFinalize();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else navigate('/tracker');
  };

  const handleFinalize = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          const clientInfo = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: (navigator as any).platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };

          await apiClient.post(`/video/rooms/${sessionId}/client-info`, clientInfo);
          sessionStorage.setItem(`location_verified_${sessionId}`, 'true');
          navigate(`/video/${sessionId}`);
        } catch (err: any) {
          setError('We could not securely verify your location. Please try again.');
        }
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
        } else {
          setError('Position unavailable. Please ensure GPS is enabled.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="flex flex-col flex-1 bg-background">
      {/* Header */}
      <header className="bg-card px-6 py-4 border-b border-border flex justify-between items-center sticky top-0 z-10 transition-all">
        <div className="font-bold text-primary flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-8 w-8" />
          True Claim Insight
        </div>
        <button
          onClick={logout}
          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col justify-center px-14 py-8">
        <div className="space-y-8">
          {/* Progress Indicator */}
          <div className="flex flex-col items-center gap-6">
            <div className="w-full">
              <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                  style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Form Area to match Login UI/UX */}
          <div className="space-y-8">
            {step === 0 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2 flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 shadow-inner">
                    <Smartphone className="h-8 w-8 text-primary" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight">Confirm Details</h1>
                  <p className="text-muted-foreground leading-relaxed">
                    Please ensure your registered phone number is correct.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Label htmlFor="phone" className="text-base">
                        Phone Number
                      </Label>
                      <InfoTooltip text="This number is linked to your claim record and will be used for session security." />
                    </div>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
                        +60
                      </div>
                      <Input
                        id="phone"
                        value={user?.phoneNumber?.replace(/^\+60/g, '') || ''}
                        readOnly
                        className="pl-12 h-14 text-lg bg-muted/50 border-dashed cursor-not-allowed"
                      />
                    </div>
                    {error && step === 0 && <ErrorMessage message={error} />}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2 flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 shadow-inner">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight">Identity Check</h1>
                  <p className="text-muted-foreground leading-relaxed">
                    Enter your 12-digit NRIC number to verify your identity.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="nric" className="text-base">
                      NRIC Number
                    </Label>
                    <InfoTooltip text="Your data will be used for identity verification purposes." />
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <User className="w-5 h-5 ml-1" />
                    </div>
                    <Input
                      id="nric"
                      value={nric}
                      onChange={e => setNric(formatNRIC(e.target.value))}
                      className="pl-12 h-14 text-lg"
                      placeholder="e.g. 850101-14-1234"
                      maxLength={14}
                    />
                  </div>
                  {error && step === 1 && <ErrorMessage message={error} />}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2 flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 shadow-inner">
                    <MapPin className="h-8 w-8 text-primary" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight">Location Access</h1>
                  <p className="text-muted-foreground leading-relaxed">
                    This ensures the assessment is conducted within clear boundaries.
                  </p>
                </div>

                <div className="flex justify-center py-1">
                  <div className="relative">
                    <div
                      className="absolute inset-0 bg-primary/20 rounded-full animate-ping scale-110 opacity-20"
                      style={{ animationDuration: '1.5s' }}
                    />
                    <div className="relative bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center text-primary shadow-inner">
                      <Radius
                        className="w-10 h-10 animate-spin"
                        style={{ animationDuration: '2s' }}
                      />
                    </div>
                  </div>
                </div>

                {permissionStatus === 'denied' && (
                  <ErrorMessage message="Location access denied. You must allow it to proceed." />
                )}
                {error && step === 2 && <ErrorMessage message={error} />}
              </div>
            )}

            <div className="space-y-4 pt-4">
              <Button
                onClick={handleNext}
                size="lg"
                className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] group"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>{step === 2 ? 'Enable & Join' : 'Continue'}</span>
                  </div>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-12 text-lg border-2 text-muted-foreground hover:bg-foreground hover:text-background font-medium transition-colors"
                onClick={handleBack}
                disabled={loading}
              >
                Back
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-12 text-[10px] uppercase text-muted-foreground font-black opacity-30 text-center">
          True Claim Insight Secure Gateway
        </p>
      </main>
    </div>
  );
}

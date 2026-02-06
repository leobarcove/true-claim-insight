import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Phone,
  Lock,
  MapPin,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useVerifyNRIC } from '@/hooks/use-claimants';
import { cn } from '@/lib/utils';

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

const normalizePhone = (p: string) => p.replace(/\+/g, '').replace(/^60/g, '0');

// --- Component ---

export function VideoAssessmentWizard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [step, setStep] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [nric, setNric] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('prompt');

  const verifyNricMutation = useVerifyNRIC();

  const steps = [
    { title: 'Information', icon: Phone },
    { title: 'Identity', icon: Lock },
    { title: 'Security', icon: MapPin },
  ];

  useEffect(() => {
    // Check if permission was already granted or denied
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
    setError(null);

    if (step === 0) {
      if (!phoneNumber) {
        setError('Phone number is required');
        return;
      }
      setStep(1);
    } else if (step === 1) {
      const validation = validateNRIC(nric);
      if (!validation.valid) {
        setError(validation.error || 'Invalid NRIC');
        return;
      }

      try {
        setLoading(true);
        const nricDigits = nric.replace(/\D/g, '');
        await verifyNricMutation.mutateAsync({
          nric: nricDigits,
          phoneNumber,
          sessionId: sessionId!,
        });

        sessionStorage.setItem(`nric_verified_${sessionId}`, 'true');
        setStep(2);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Verification failed. Please check your details.');
      } finally {
        setLoading(false);
      }
    } else if (step === 2) {
      handleFinalize();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else navigate('/tracker');
  };

  const handleFinalize = () => {
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
        } finally {
          setLoading(false);
        }
      },
      err => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location access was denied. You must allow it to proceed.');
          setPermissionStatus('denied');
        } else {
          setError('Position unavailable. Please ensure GPS is enabled.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-muted/10">
      {/* Header & Progress */}
      <div className="bg-background/80 backdrop-blur-md border-b border-border px-6 pt-10 pb-6 sticky top-0 z-20">
        <div className="max-w-md mx-auto w-full">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl">
                <img src="/logo.png" alt="Logo" className="w-6 h-6" />
              </div>
              <h2 className="font-bold text-lg tracking-tight">Assessment Setup</h2>
            </div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted px-3 py-1.5 rounded-full">
              Step {step + 1} of 3
            </span>
          </div>

          {/* Progress Bar */}
          <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="flex justify-between mt-4">
            {steps.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center gap-1.5 transition-colors duration-300',
                  i <= step ? 'text-primary' : 'text-muted-foreground/40'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                    i < step
                      ? 'bg-primary border-primary text-primary-foreground'
                      : i === step
                        ? 'border-primary bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                        : 'border-muted-foreground/20'
                  )}
                >
                  {i < step ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold">{s.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center p-6 mt-4">
        <div className="max-w-md w-full bg-card rounded-[2.5rem] shadow-xl shadow-foreground/[0.02] dark:shadow-none border border-border overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
          <div className="p-8 md:p-10">
            {step === 0 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">Confirm Details</h1>
                  <p className="text-muted-foreground text-sm">
                    Please ensure your contact number is correct.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                        <Phone className="w-5 h-5" />
                      </div>
                      <Input
                        id="phone"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        className="pl-12 h-14 rounded-2xl border-border bg-muted/20 text-lg transition-all focus:ring-4 focus:ring-primary/5"
                        placeholder="e.g. +60123456789"
                      />
                    </div>
                  </div>

                  <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex gap-4">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-600/80 dark:text-blue-400 leading-relaxed font-medium">
                      This number must match the one linked to your insurance claim.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">Identity Check</h1>
                  <p className="text-muted-foreground text-sm">
                    Enter your 12-digit NRIC number to verify your identity.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nric">NRIC Number</Label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                        <Lock className="w-5 h-5" />
                      </div>
                      <Input
                        id="nric"
                        value={nric}
                        onChange={e => setNric(formatNRIC(e.target.value))}
                        className="pl-12 h-14 rounded-2xl border-border bg-muted/20 text-lg transition-all focus:ring-4 focus:ring-primary/5"
                        placeholder="YYMMDD-XX-XXXX"
                        maxLength={14}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground px-1 font-bold uppercase tracking-widest">
                      Format: 12 Digits (e.g. 850101-14-1234)
                    </p>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 flex gap-4">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400 leading-relaxed font-medium">
                      Your data is encrypted and used only for identity validation purposes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">Location Access</h1>
                  <p className="text-muted-foreground text-sm">
                    Mandatory for regulatory compliance in this assessment.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-center py-6">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping scale-150 opacity-20" />
                      <div className="relative bg-primary/10 w-24 h-24 rounded-full flex items-center justify-center text-primary shadow-inner">
                        <MapPin className="w-12 h-12" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-2xl p-5 border border-border flex gap-4">
                    <ShieldCheck className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 text-primary shadow-sm" />
                    <div className="space-y-1">
                      <h3 className="font-bold text-foreground text-sm">Secure Verification</h3>
                      <p className="text-xs text-muted-foreground leading-normal">
                        This ensures the assessment happens within approved boundaries to prevent
                        fraud.
                      </p>
                    </div>
                  </div>

                  {permissionStatus === 'denied' && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 px-4 py-4 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold">Access Required</p>
                        <p className="text-xs leading-normal font-medium">
                          Please reset location permissions in your browser settings and refresh.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-4 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black opacity-50">
          True Claim Insight Secure Gateway
        </p>
      </main>

      {/* Footer Navigation */}
      <footer className="bg-background border-t border-border p-6 pb-12">
        <div className="max-w-md mx-auto w-full flex gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            className="flex-1 h-16 rounded-2xl font-bold border-2 transition-all active:scale-95 group overflow-hidden"
            disabled={loading}
          >
            <ChevronLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" />
            <span className="relative z-10">{step === 0 ? 'Cancel' : 'Back'}</span>
          </Button>

          <Button
            onClick={handleNext}
            className="flex-[2] h-16 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95 group"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>{step === 2 ? 'Enable & Join' : 'Continue'}</span>
                {step !== 2 && (
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                )}
              </div>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}

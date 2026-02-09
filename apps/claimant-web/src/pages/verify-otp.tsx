import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquareLock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVerifyOtp, useSendOtp } from '@/hooks/use-otp';
import { AxiosError } from 'axios';

interface LocationState {
  phoneNumber: string;
  expiresIn: number;
  from?: string;
}

export function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(state?.expiresIn || 300);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const verifyOtp = useVerifyOtp();
  const resendOtp = useSendOtp();

  // Redirect if no phone number in state
  useEffect(() => {
    if (!state?.phoneNumber) {
      navigate('/login', { replace: true });
    }
  }, [state, navigate]);

  // Sync countdown to sessionStorage periodically to keep session fresh if user navigates back
  useEffect(() => {
    if (state?.phoneNumber && countdown > 0) {
      sessionStorage.setItem(
        'otp_session',
        JSON.stringify({
          phoneNumber: state.phoneNumber,
          expiresAt: Date.now() + countdown * 1000,
        })
      );
    }
  }, [countdown, state?.phoneNumber]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only last digit
    setOtp(newOtp);
    setError(null);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newOtp.every(d => d) && newOtp.join('').length === 6) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newOtp = pasted.split('');
      setOtp(newOtp);
      handleVerify(pasted);
    }
  };

  const handleVerify = async (code: string) => {
    if (!state?.phoneNumber) return;

    try {
      await verifyOtp.mutateAsync({
        phoneNumber: state.phoneNumber,
        code,
        redirectUrl: state.from,
      });
      // Clear session upon successful verification
      sessionStorage.removeItem('otp_session');
    } catch (err) {
      const axiosError = err as AxiosError<{ message: string }>;
      setError(axiosError.response?.data?.message || 'Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (!state?.phoneNumber) return;

    try {
      const result = await resendOtp.mutateAsync(state.phoneNumber);
      setCountdown(result.expiresIn);
      setError(null);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();

      // Explicitly update session storage on resend
      sessionStorage.setItem(
        'otp_session',
        JSON.stringify({
          phoneNumber: state.phoneNumber,
          expiresAt: Date.now() + result.expiresIn * 1000,
        })
      );
    } catch (err) {
      setError('Failed to resend code. Please try again.');
    }
  };

  if (!state?.phoneNumber) {
    return null;
  }

  return (
    <div className="flex flex-col flex-1 bg-background">
      <main className="flex-1 flex flex-col justify-center px-14">
        <div className="space-y-8">
          {/* Header UI to match Login */}
          <div className="space-y-2 flex flex-col items-center text-center transition-all">
            <div className="h-[5.5rem] w-[5.5rem] rounded-2xl bg-primary/10 flex items-center justify-center mt-12 mb-8 shadow-inner">
              <MessageSquareLock className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Enter verification code</h1>
            <p className="text-muted-foreground leading-relaxed">
              We sent a 6-digit code to
              <br />
              <span className="font-medium text-muted-foreground">{state.phoneNumber}</span>
            </p>
          </div>

          {/* Form UI matching Login structure */}
          <div className="space-y-8">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg text-center font-medium">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-base block w-full">Verification Code</Label>
              <div className="flex justify-between gap-2" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={el => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleChange(index, e.target.value)}
                    onKeyDown={e => handleKeyDown(index, e)}
                    className="w-14 h-14 text-center text-2xl font-bold bg-muted/20 border-2 focus:border-primary transition-all p-0"
                    disabled={verifyOtp.isPending}
                  />
                ))}
              </div>

              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Resend in{' '}
                    <span className="text-foreground font-bold">{formatTime(countdown)}</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendOtp.isPending}
                    className="text-xs font-bold text-primary hover:text-primary/80 tracking-wider flex items-center justify-center gap-1.5 mx-auto transition-colors disabled:opacity-50"
                  >
                    {resendOtp.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Resend
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Button
                size="lg"
                className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20"
                onClick={() => handleVerify(otp.join(''))}
                disabled={verifyOtp.isPending || otp.some(d => !d)}
              >
                {verifyOtp.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Verifying
                  </>
                ) : (
                  'Continue'
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-12 text-lg border-2 text-muted-foreground hover:bg-foreground hover:text-background font-medium transition-colors"
                onClick={() => navigate(-1)}
              >
                Back
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

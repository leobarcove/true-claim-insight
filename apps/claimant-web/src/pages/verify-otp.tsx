import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
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
    if (newOtp.every((d) => d) && newOtp.join('').length === 6) {
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
      // Navigation handled by the mutation's onSuccess
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
    } catch (err) {
      setError('Failed to resend code. Please try again.');
    }
  };

  if (!state?.phoneNumber) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-4 py-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back</span>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col justify-center px-6">
        <div className="space-y-8">
          {/* Title */}
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Enter verification code</h1>
            <p className="text-muted-foreground">
              We sent a 6-digit code to
              <br />
              <span className="font-medium text-foreground">{state.phoneNumber}</span>
            </p>
            {/* DEV ONLY: Show the code for easier testing */}
            <div className="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-800 font-mono text-center">
                [DEV ONLY] Verification Code: <span className="font-bold">123456</span>
              </p>
            </div>
          </div>

          {/* OTP Input */}
          <div className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg text-center">
                {error}
              </div>
            )}

            <div className="flex justify-center gap-3" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-14 text-center text-2xl font-bold"
                  disabled={verifyOtp.isPending}
                />
              ))}
            </div>

            {/* Timer & Resend */}
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Code expires in{' '}
                  <span className="font-medium text-foreground">
                    {formatTime(countdown)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-destructive">Code expired</p>
              )}
            </div>

            {/* Resend Button */}
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleResend}
              disabled={resendOtp.isPending || (countdown > 240)} // Allow resend after 1 min
            >
              {resendOtp.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend code
                </>
              )}
            </Button>

            {/* Verify Button (for manual submit) */}
            <Button
              size="lg"
              className="w-full h-14 text-lg"
              onClick={() => handleVerify(otp.join(''))}
              disabled={verifyOtp.isPending || otp.some((d) => !d)}
            >
              {verifyOtp.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

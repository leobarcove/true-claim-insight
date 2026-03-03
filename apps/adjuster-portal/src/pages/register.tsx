import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AxiosError } from 'axios';
import { Eye, EyeOff, Loader2, ArrowLeft, MessageSquareLock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegister, useVerifyRegistration, useResendVerificationOtp } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email'),
    phoneNumber: z
      .string()
      .min(10, 'Phone number must be at least 10 digits')
      .regex(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number (e.g., +60123456789)'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and number'
      ),
    confirmPassword: z.string(),
    licenseNumber: z.string().optional(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

interface ApiErrorResponse {
  message: string | string[];
  error: string;
  statusCode: number;
}

export function RegisterPage() {
  const registerMutation = useRegister();
  const verifyMutation = useVerifyRegistration();
  const resendOtpMutation = useResendVerificationOtp();
  const { toast } = useToast();

  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(searchParams.get('verify') === 'true');
  const [registeredUser, setRegisteredUser] = useState<{ id: string; phoneNumber: string } | null>(
    searchParams.get('userId') && searchParams.get('phone')
      ? { id: searchParams.get('userId')!, phoneNumber: searchParams.get('phone')! }
      : null
  );
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendCountdown, setResendCountdown] = useState(0);

  // If initial load and isVerifying, start countdown
  useEffect(() => {
    if (isVerifying && resendCountdown === 0) {
      setResendCountdown(60);
    }
  }, []);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Handle resend countdown
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setError(null);

    try {
      const result = await registerMutation.mutateAsync({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        role: 'ADJUSTER',
        licenseNumber: data.licenseNumber || undefined,
      });

      if (result.requiresVerification) {
        setRegisteredUser({
          id: result.user.id,
          phoneNumber: result.user.phoneNumber,
        });
        setIsVerifying(true);
        setResendCountdown(60);
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ success: false; error: ApiErrorResponse }>;
      const errorData = axiosError.response?.data?.error;
      const message = errorData?.message;

      if (Array.isArray(message)) {
        setError(message[0]);
      } else if (message) {
        setError(message);
      } else {
        setError('Registration failed. Please try again.');
      }
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
    }
  };

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6 || !registeredUser) return;

    setError(null);
    try {
      await verifyMutation.mutateAsync({
        userId: registeredUser.id,
        code,
      });
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      setError(axiosError.response?.data?.message?.toString() || 'Invalid OTP code');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResendOtp = async () => {
    if (!registeredUser || resendCountdown > 0) return;

    try {
      await resendOtpMutation.mutateAsync(registeredUser.phoneNumber);
      setResendCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      toast({
        title: 'OTP Resent',
        description: 'A new verification code has been sent to your phone.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to resend OTP. Please try again later.',
        variant: 'destructive',
      });
    }
  };

  const isLoading = registerMutation.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <img src="/logo.png" alt="Logo" className="h-12 w-12" />
            <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
            <CardDescription className="text-center">
              Register as a loss adjuster on True Claim Insight
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isVerifying ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-2 flex flex-col items-center text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner">
                  <MessageSquareLock className="h-8 w-8 text-primary" />
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  We've sent a 6-digit code to
                  <span className="font-semibold text-foreground block">
                    {registeredUser?.phoneNumber}
                  </span>
                </p>
              </div>

              <form onSubmit={onVerifyOtp} className="space-y-8">
                <div className="space-y-2">
                  <div className="flex justify-between gap-2 px-4" onPaste={handleOtpPaste}>
                    {otp.map((digit, index) => (
                      <Input
                        key={index}
                        ref={el => (inputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(index, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(index, e)}
                        className="w-12 h-14 text-center text-2xl font-bold bg-muted/20 border-2 focus:border-primary transition-all p-0"
                        disabled={verifyMutation.isPending}
                      />
                    ))}
                  </div>
                  <div className="text-center">
                    {resendCountdown > 0 ? (
                      <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Resend in{' '}
                        <span className="text-foreground font-bold">{resendCountdown}</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendOtpMutation.isPending}
                        className="text-xs font-bold text-primary hover:text-primary/80 tracking-wider flex items-center justify-center gap-1.5 mx-auto transition-colors disabled:opacity-50"
                      >
                        {resendOtpMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Resend
                      </button>
                    )}
                  </div>
                  {error && (
                    <p className="text-xs text-destructive text-center mt-2 animate-in fade-in slide-in-from-top-1">
                      {error}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={otp.some(d => !d) || verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Ahmad bin Abdullah"
                  {...register('fullName')}
                />
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  {...register('email')}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="+60123456789"
                  {...register('phoneNumber')}
                />
                {errors.phoneNumber && (
                  <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
                )}
              </div>

              {/* <div className="space-y-2">
                <Label htmlFor="licenseNumber">License Number (Optional)</Label>
                <Input
                  id="licenseNumber"
                  type="text"
                  placeholder="LA-2025-001234"
                  {...register('licenseNumber')}
                />
                {errors.licenseNumber && (
                  <p className="text-sm text-destructive">{errors.licenseNumber.message}</p>
                )}
              </div> */}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    {...register('password')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Must contain uppercase, lowercase, and number
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    {...register('confirmPassword')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

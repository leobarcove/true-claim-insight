import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AxiosError } from 'axios';
import { ArrowLeft, Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidMalaysianPhone } from '@/lib/utils';
import { useSendOtp } from '@/hooks/use-otp';

const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, 'Phone number is required')
    .refine(isValidMalaysianPhone, 'Please enter a valid Malaysian phone number'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const sendOtp = useSendOtp();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  const onSubmit = async (data: PhoneFormData) => {
    setError(null);

    try {
      const result = await sendOtp.mutateAsync(data.phoneNumber);
      
      // Navigate to OTP verification page with phone number
      navigate('/verify-otp', {
        state: {
          phoneNumber: result.phoneNumber,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      const axiosError = err as AxiosError<{ message: string }>;
      setError(axiosError.response?.data?.message || 'Failed to send OTP. Please try again.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-4 py-4">
        <Link
          to="/"
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
          <div className="space-y-2">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Phone className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Enter your phone number</h1>
            <p className="text-muted-foreground">
              We'll send you a verification code to confirm your identity
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  +60
                </div>
                <Input
                  id="phoneNumber"
                  type="tel"
                  inputMode="numeric"
                  placeholder="12 345 6789"
                  className="pl-12 h-14 text-lg"
                  {...register('phoneNumber')}
                />
              </div>
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">
                  {errors.phoneNumber.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Example: 012 345 6789 or 011 2345 6789
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg"
              disabled={sendOtp.isPending}
            >
              {sendOtp.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending code...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6">
        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our{' '}
          <a href="#" className="text-primary underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-primary underline">
            Privacy Policy
          </a>
        </p>
      </footer>
    </div>
  );
}


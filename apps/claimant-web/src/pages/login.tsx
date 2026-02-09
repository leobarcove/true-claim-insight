import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AxiosError } from 'axios';
import { Smartphone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidMalaysianPhone, formatMalaysianPhone } from '@/lib/utils';
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
  const location = useLocation();
  const sendOtp = useSendOtp();
  const [error, setError] = useState<string | null>(null);
  const from = location.state?.from;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  // Prefill phone number from existing session if available
  useEffect(() => {
    const storedSession = sessionStorage.getItem('otp_session');
    if (storedSession) {
      const { phoneNumber } = JSON.parse(storedSession);
      const rawNumber = phoneNumber.replace(/^\+60/g, '');
      setValue('phoneNumber', rawNumber);
    }
  }, [setValue]);

  const onSubmit = async (data: PhoneFormData) => {
    setError(null);

    // Check for existing valid session to follow requested bypass prevention
    const storedSession = sessionStorage.getItem('otp_session');
    if (storedSession) {
      const { phoneNumber, expiresAt } = JSON.parse(storedSession);
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      const formattedPhone = formatMalaysianPhone(data.phoneNumber);

      if (phoneNumber === formattedPhone && remaining > 30) {
        // Only skip if more than 30s left
        navigate('/otp', {
          state: {
            phoneNumber,
            expiresIn: remaining,
            from,
          },
        });
        return;
      }
    }

    try {
      const result = await sendOtp.mutateAsync(data.phoneNumber);

      // Store session to handle back-and-forth scenario
      sessionStorage.setItem(
        'otp_session',
        JSON.stringify({
          phoneNumber: result.phoneNumber,
          expiresAt: Date.now() + result.expiresIn * 1000,
        })
      );

      navigate('/otp', {
        state: {
          phoneNumber: result.phoneNumber,
          expiresIn: result.expiresIn,
          from,
        },
      });
    } catch (err) {
      const axiosError = err as AxiosError<{ message: string }>;
      setError(
        axiosError.response?.data?.message || 'Failed to send verification code. Please try again.'
      );
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-background">
      {/* Content */}
      <main className="flex-1 flex flex-col justify-center px-14">
        <div className="space-y-8">
          {/* Title */}
          <div className="space-y-2 flex flex-col items-center text-center transition-all">
            <div className="h-[5.5rem] w-[5.5rem] rounded-2xl bg-primary/10 flex items-center justify-center mt-12 mb-8 shadow-inner">
              <Smartphone className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Enter phone number</h1>
            <p className="text-muted-foreground leading-relaxed">
              We'll send you a verification code to confirm your identity
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2 mt-2">
              <Label htmlFor="phoneNumber" className="text-base">
                Phone Number
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
                  +60
                </div>
                <Input
                  id="phoneNumber"
                  type="tel"
                  inputMode="numeric"
                  placeholder="12 345 6789"
                  className="pl-12 h-14 text-lg"
                  maxLength={11}
                  {...register('phoneNumber', {
                    onChange: e => {
                      e.target.value = e.target.value.replace(/\D/g, '');
                    },
                  })}
                />
              </div>
              {errors.phoneNumber && (
                <p className="text-sm text-destructive font-medium ml-1">
                  {errors.phoneNumber.message}
                </p>
              )}
            </div>

            <div className="space-y-4 pt-4">
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20"
                disabled={sendOtp.isPending}
              >
                {sendOtp.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Sending
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
          </form>
        </div>
      </main>
    </div>
  );
}

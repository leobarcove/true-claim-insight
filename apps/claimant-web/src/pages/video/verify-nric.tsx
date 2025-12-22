import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVerifyNRIC } from '@/hooks/use-claimants';

export function VerifyNRICPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [nric, setNric] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verifyMutation = useVerifyNRIC();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    
    setError(null);
    
    try {
      await verifyMutation.mutateAsync({ nric, sessionId });
      
      // Store verification in sessionStorage for the session
      sessionStorage.setItem(`nric_verified_${sessionId}`, 'true');
      
      // Proceed to the video call
      navigate(`/video/${sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Verification failed. Please check your NRIC.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header Decor */}
        <div className="flex justify-center mb-8">
          <div className="bg-blue-600 p-4 rounded-3xl shadow-xl shadow-blue-200">
            <ShieldCheck className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 p-10 border border-slate-100">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
              Identity Verification
            </h1>
            <p className="text-slate-500 text-lg leading-relaxed">
              Please enter your NRIC to proceed to the secure video assessment.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="nric" className="text-sm font-semibold text-slate-700 ml-1">
                NRIC Number
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600 text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <Input
                  id="nric"
                  type="text"
                  placeholder="e.g. 850101141234"
                  className="pl-12 h-14 rounded-2xl border-slate-200 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all text-lg"
                  value={nric}
                  onChange={(e) => setNric(e.target.value)}
                  disabled={verifyMutation.isPending}
                  required
                />
              </div>
              <p className="text-xs text-slate-400 ml-1 mt-2">
                Format: YYMMDD-XX-XXXX or digits only
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98] group"
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Start Assessment</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>
          </form>
        </div>

        {/* Security Footer */}
        <div className="mt-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>End-to-End Encrypted Identity Verification</span>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">
            Protected by True Claim Insight Security
          </p>
        </div>
      </div>
    </div>
  );
}

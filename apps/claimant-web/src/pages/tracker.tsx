import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Video, FileText, LogOut, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useClaims, useClaimSessions } from '@/hooks/use-claims';
import { cn, convertToTitleCase, formatDate } from '@/lib/utils';
import type { Claim } from '@tci/shared-types';

export function AssessmentTrackerPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: claimsData, isLoading: isLoadingClaims } = useClaims(user?.id);
  const activeClaims =
    claimsData?.claims
      ?.filter(c => !['APPROVED', 'REJECTED', 'CLOSED'].includes(c.status))
      ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      ?.slice(0, 5) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'ASSIGNED':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'SCHEDULED':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'IN_ASSESSMENT':
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-background min-h-screen">
      <header className="bg-card px-6 py-4 border-b border-border flex justify-between items-center sticky top-0 z-10 shadow-sm backdrop-blur-md bg-opacity-90">
        <div className="font-bold text-primary flex items-center gap-2 text-xl tracking-tight">
          <img src="/logo.png" alt="Logo" className="h-8 w-8" />
          True Claim
        </div>
        <button
          onClick={logout}
          className="p-2.5 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive transition-all duration-200"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="flex-1 px-4 md:px-14 py-8 space-y-10 w-full max-w-3xl mx-auto">
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-card to-secondary/20 rounded-3xl p-6 shadow-sm border border-border/50">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-3xl ring-4 ring-background">
              👋
            </div>
            <div>
              <h2 className="font-bold text-xl text-foreground tracking-tight">Welcome back</h2>
              <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {user?.phoneNumber}
              </p>
            </div>
          </div>
        </div>

        {/* Active Claims List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-foreground flex items-center gap-2.5">
              <CheckCircle2 size={20} className="text-primary" />
              Active Cases
            </h3>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {activeClaims.length} Active
            </span>
          </div>

          {isLoadingClaims ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Loading your cases...</p>
            </div>
          ) : activeClaims.length > 0 ? (
            <div className="grid gap-6">
              {activeClaims.map(claim => (
                <ClaimCard key={claim.id} claim={claim} getStatusColor={getStatusColor} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border">
              <p className="text-muted-foreground font-medium">No active claims found.</p>
              <button
                onClick={() => navigate('/claims/submit')}
                className="mt-4 text-primary font-bold hover:underline"
              >
                Submit a new claim
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ClaimCard({
  claim,
  getStatusColor,
}: {
  claim: Claim;
  getStatusColor: (s: string) => string;
}) {
  const navigate = useNavigate();
  // Fetch active session for this specific claim
  const { data: sessions } = useClaimSessions(claim.id);
  const activeSession = sessions?.find(s => s.status === 'ACTIVE' || s.status === 'SCHEDULED');

  return (
    <div
      className="group bg-card hover:bg-card/80 rounded-3xl shadow-sm hover:shadow-md border border-border overflow-hidden transition-all duration-300 cursor-pointer relative"
      onClick={() => navigate(`/claims/${claim.id}`)}
    >
      <div className="p-6 space-y-5">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
              Vehicle Plate
            </div>
            <div className="text-xl font-bold text-foreground tracking-tight font-mono">
              {claim.vehiclePlateNumber || 'N/A'}
            </div>
          </div>
          <div
            className={cn(
              'px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
              getStatusColor(claim.status)
            )}
          >
            {claim.status.replace('_', ' ')}
          </div>
        </div>

        <div className="pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-muted-foreground" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate">Claim Type</p>
              <p className="text-xs text-muted-foreground truncate">
                {convertToTitleCase(claim.claimType)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} className="text-muted-foreground" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate">Reference</p>
              <p className="text-xs text-muted-foreground truncate font-mono">
                {claim.claimNumber}
              </p>
            </div>
          </div>
        </div>

        {activeSession && (
          <div
            className="animate-in fade-in slide-in-from-bottom-2 duration-500 pt-2"
            onClick={e => {
              e.stopPropagation();
              navigate(`/video/${activeSession.id}/join`);
            }}
          >
            <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-3.5 rounded-xl flex items-center justify-center gap-2.5 font-bold transition-all shadow-lg shadow-primary/20 active:scale-[0.98] group-hover:translate-y-[-2px]">
              <Video size={18} fill="currentColor" className="animate-pulse" />
              <span>Join Live Assessment</span>
            </button>
            <p className="text-[10px] text-center text-muted-foreground font-semibold mt-2.5 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Assessment Ready
            </p>
          </div>
        )}
      </div>

      <div className="px-6 py-3 bg-muted/30 border-t border-border flex justify-between items-center group-hover:bg-muted/50 transition-colors">
        <span className="text-xs text-muted-foreground font-medium">
          Created: {formatDate(claim.createdAt)}
        </span>
        <div className="flex items-center gap-1 text-xs text-primary font-bold group-hover:translate-x-1 transition-transform">
          View Details <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
}

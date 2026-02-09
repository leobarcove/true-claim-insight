import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Clock,
  ShieldCheck,
  AlertCircle,
  Video,
} from 'lucide-react';
import { useClaim, useClaimSessions } from '@/hooks/use-claims';
import { cn, convertToTitleCase, formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export function ClaimDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: claim, isLoading: isLoadingClaim } = useClaim(id || '');
  const { data: sessions } = useClaimSessions(id || '');

  // Find active session for this claim
  const activeSession = sessions?.find(
    s => s.status === 'IN_PROGRESS' || s.status === 'WAITING' || s.status === 'SCHEDULED'
  );

  if (isLoadingClaim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground font-medium">Loading details...</p>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
        <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Claim Not Found</h2>
        <p className="text-muted-foreground mb-6">
          We couldn't find the claim details you requested.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

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
      case 'APPROVED':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'REJECTED':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'CLOSED':
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card px-4 py-4 border-b border-border sticky top-0 z-10 flex items-center gap-4">
        <button
          onClick={() => navigate('/tracker')}
          className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg truncate flex-1">Claim Details</h1>
        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0',
            getStatusColor(claim.status)
          )}
        >
          {claim.status.replace('_', ' ')}
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl mx-auto w-full">
        {activeSession?.sessionId && (
          <div
            className={cn(
              'border rounded-2xl p-5 shadow-sm',
              activeSession.status === 'IN_PROGRESS'
                ? 'bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20'
                : activeSession.status === 'WAITING'
                  ? 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20'
                  : 'bg-card border-border'
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'p-3 rounded-xl shrink-0',
                  activeSession.status === 'IN_PROGRESS' ? 'bg-green-500/20' : 'bg-primary/20'
                )}
              >
                <Video
                  className={cn(
                    'w-6 h-6',
                    activeSession.status === 'IN_PROGRESS' || activeSession.status === 'WAITING'
                      ? 'text-green-600 dark:text-green-400 animate-pulse'
                      : 'text-primary'
                  )}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground">
                  {activeSession.status === 'IN_PROGRESS'
                    ? 'Video Assessment In Progress'
                    : activeSession.status === 'WAITING'
                      ? 'Video Assessment Ready'
                      : 'Video Assessment Scheduled'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  {activeSession.status === 'IN_PROGRESS'
                    ? 'The session has started. Please join immediately.'
                    : activeSession.status === 'WAITING'
                      ? 'An adjuster is waiting for you. Please join now.'
                      : `Scheduled at ${activeSession.scheduledTime ? formatDate(activeSession.scheduledTime) : 'a later time'}.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/video/${activeSession.sessionId}/join`)}
              className="w-full py-3 rounded-xl font-bold transition-all shadow-lg active:scale-[0.98] bg-green-600 hover:bg-green-700 text-white shadow-green-500/20"
            >
              Join Now
            </button>
          </div>
        )}

        {/* Claim Info */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border/50">
            <h2 className="text-2xl font-black tracking-tight mb-1">{claim.vehiclePlateNumber}</h2>
            <p className="text-sm text-muted-foreground font-medium">
              Claim Reference: {claim.claimNumber}
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <InfoItem
                  icon={FileText}
                  label="Claim Type"
                  value={convertToTitleCase(claim.claimType)}
                />
                <InfoItem
                  icon={Calendar}
                  label="Incident Date"
                  value={formatDate(claim.incidentDate)}
                />
              </div>

              <div className="space-y-4">
                {claim.vehicleMake && (
                  <InfoItem
                    icon={ShieldCheck}
                    label="Vehicle"
                    value={`${claim.vehicleMake} ${claim.vehicleModel || ''}`}
                  />
                )}
                {claim.updatedAt && (
                  <InfoItem icon={Clock} label="Last Updated" value={formatDate(claim.updatedAt)} />
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-border/50">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                Incident Location
              </h3>
              <div className="bg-muted/30 p-4 rounded-xl text-sm leading-relaxed">
                {(claim.incidentLocation as any)?.address || JSON.stringify(claim.incidentLocation)}
              </div>
            </div>

            <div className="pt-2">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                Description
              </h3>
              <div className="bg-muted/30 p-4 rounded-xl text-sm leading-relaxed">
                {claim.description}
              </div>
            </div>
          </div>
        </div>

        {/* Adjuster Info */}
        {claim.adjuster && (
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center text-xl">
              👨‍💼
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Assigned Adjuster
              </p>
              <h3 className="font-bold text-foreground">
                {(claim.adjuster as any)?.user?.fullName || 'Assigned'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {(claim.adjuster as any)?.user?.email}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

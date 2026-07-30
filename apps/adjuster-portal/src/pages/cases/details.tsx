import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  FileQuestion,
  FileText,
  Landmark,
  Search,
  Send,
  Upload,
  UserRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { convertToTitleCase } from '@/lib/utils';
import {
  CASE_FLOWS,
  TRAVEL_CLAIM_TYPE_LABELS,
  TravelClaimType,
  type FlowStep,
} from '@tci/shared-types';
import {
  caseKeys,
  useCase,
  useConvertCase,
  useLinkCasePolicy,
  usePolicySearch,
  useReferCaseToExpert,
  useRejectCase,
  useRequestCaseInfo,
  useSubmitCase,
} from '@/hooks/use-cases';
import { useQueryClient } from '@tanstack/react-query';
import { caseStatusConfig } from './index';

const EDITABLE_STATUSES = ['DRAFT', 'IN_PROGRESS', 'INFO_REQUESTED'];
const REVIEWABLE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW'];

export function CaseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: caseData, isLoading } = useCase(id);

  const submitCase = useSubmitCase();
  const requestInfo = useRequestCaseInfo();
  const referExpert = useReferCaseToExpert();
  const rejectCase = useRejectCase();
  const convertCase = useConvertCase();
  const linkPolicy = useLinkCasePolicy();

  const [reviewNote, setReviewNote] = useState('');
  const [policySearch, setPolicySearch] = useState('');
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const { data: policyResults } = usePolicySearch(policySearch);

  const [uploadType, setUploadType] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flow = caseData?.travelClaimType
    ? CASE_FLOWS[caseData.travelClaimType as TravelClaimType]
    : null;

  const answeredSteps = useMemo(() => {
    if (!flow || !caseData) return [] as Array<{ step: FlowStep; value: string }>;
    return flow.steps
      .filter(step => step.answerType !== 'confirm' && caseData.answers?.[step.id] !== undefined)
      .map(step => ({ step, value: String(caseData.answers[step.id]) }));
  }, [flow, caseData]);

  if (isLoading || !caseData) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Case" description="Loading case details" />
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const status = caseStatusConfig[String(caseData.status)];
  const isEditable = EDITABLE_STATUSES.includes(String(caseData.status));
  const isReviewable = REVIEWABLE_STATUSES.includes(String(caseData.status));
  const isMedical = caseData.travelClaimType === TravelClaimType.MEDICAL;
  const canConvert = isMedical
    ? String(caseData.status) === 'REFERRED_TO_EXPERT'
    : isReviewable;

  const requirements = caseData.evidenceRequirements || [];
  const uploadedTypes = new Set((caseData.documents || []).map(doc => doc.documentType));

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setReviewNote('');
      toast({ title: success });
    } catch (error: any) {
      toast({
        title: 'Action failed',
        description: error?.response?.data?.error?.message || error?.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpload = async (file: File) => {
    if (!uploadType) {
      toast({ title: 'Choose a document type first', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', uploadType);
      await apiClient.post(`/cases/${id}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      queryClient.invalidateQueries({ queryKey: caseKeys.detail(id) });
      toast({ title: 'Document uploaded' });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error?.response?.data?.error?.message || error?.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title={caseData.caseNumber}
        description={
          caseData.travelClaimType
            ? `${TRAVEL_CLAIM_TYPE_LABELS[caseData.travelClaimType as TravelClaimType]} — ${convertToTitleCase(String(caseData.channel))} intake`
            : 'Travel claim request'
        }
      >
        <Button variant="outline" size="sm" onClick={() => navigate('/cases')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Status strip */}
        <div className="flex flex-wrap items-center gap-3">
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
          {caseData.outOfWindow ? (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" /> Outside 30-day window
            </Badge>
          ) : caseData.notifiedLate ? (
            <Badge variant="warning">
              <Clock className="h-3 w-3 mr-1" /> Notified after 24h
            </Badge>
          ) : null}
          {caseData.needsPolicyReview && (
            <Badge variant="warning">
              <FileQuestion className="h-3 w-3 mr-1" /> Policy unmatched
            </Badge>
          )}
          {caseData.convertedClaim && (
            <Link to={`/claims/${caseData.convertedClaim.id}`}>
              <Badge variant="success">
                Converted → {caseData.convertedClaim.claimNumber}
              </Badge>
            </Link>
          )}
        </div>

        {caseData.reviewNote && (
          <Card className="border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-3 text-sm">
              <span className="font-medium">Review note: </span>
              {caseData.reviewNote}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: answers + documents */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Intake answers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {answeredSteps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No answers captured yet.</p>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {answeredSteps.map(({ step, value }) => (
                      <div key={step.id} className="text-sm">
                        <dt className="text-muted-foreground">{step.label}</dt>
                        <dd className="font-medium break-words">
                          {step.answerType === 'document'
                            ? 'Uploaded'
                            : step.answerType === 'choice'
                              ? convertToTitleCase(value)
                              : value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>

            {/* Evidence checklist + documents */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Evidence checklist</span>
                  {caseData.completeness && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {caseData.completeness.mandatoryUploaded}/{caseData.completeness.mandatoryTotal}{' '}
                      mandatory uploaded
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {requirements.map(req => {
                  const satisfied = uploadedTypes.has(req.documentType);
                  return (
                    <div key={req.documentType} className="flex items-start gap-2 text-sm">
                      {satisfied ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground mt-0.5" />
                      )}
                      <div>
                        <span className="font-medium">
                          {convertToTitleCase(req.documentType)}
                        </span>
                        {!req.isMandatory && (
                          <span className="text-muted-foreground"> (optional)</span>
                        )}
                        {req.description && (
                          <p className="text-xs text-muted-foreground">{req.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {(caseData.documents?.length || 0) > 0 && (
                  <div className="pt-3 border-t border-border mt-3 space-y-2">
                    {caseData.documents!.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{doc.fileName}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary">{convertToTitleCase(doc.documentType)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(doc.createdAt), 'dd MMM')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {isEditable && (
                  <div className="flex items-center gap-2 pt-3 border-t border-border mt-3">
                    <Select value={uploadType} onValueChange={setUploadType}>
                      <SelectTrigger className="w-[260px]">
                        <SelectValue placeholder="Document type…" />
                      </SelectTrigger>
                      <SelectContent>
                        {requirements.map(req => (
                          <SelectItem key={req.documentType} value={req.documentType}>
                            {convertToTitleCase(req.documentType)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) void handleUpload(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {uploading ? 'Uploading…' : 'Upload'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: claimant, policy, bank, actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserRound className="h-4 w-4" /> Claimant
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{caseData.claimant?.fullName || 'Unknown'}</p>
                <p className="text-muted-foreground">{caseData.claimant?.phoneNumber}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Policy</span>
                  <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Search className="h-4 w-4 mr-1" /> Link
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Link a policy</DialogTitle>
                      </DialogHeader>
                      <Input
                        placeholder="Search policy number, name or phone…"
                        value={policySearch}
                        onChange={e => setPolicySearch(e.target.value)}
                      />
                      <div className="space-y-2 max-h-64 overflow-auto">
                        {(policyResults || []).map(policy => (
                          <button
                            key={policy.id}
                            className="w-full text-left rounded-md border border-border p-3 text-sm hover:border-primary"
                            onClick={() =>
                              runAction(async () => {
                                await linkPolicy.mutateAsync({ caseId: id, policyId: policy.id });
                                setPolicyDialogOpen(false);
                              }, 'Policy linked')
                            }
                          >
                            <p className="font-medium">{policy.policyNumber}</p>
                            <p className="text-muted-foreground">
                              {policy.insuredName} · {policy.tenant?.name}
                            </p>
                          </button>
                        ))}
                        {policySearch.trim().length >= 2 && (policyResults || []).length === 0 && (
                          <p className="text-sm text-muted-foreground">No policies found.</p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {caseData.policy ? (
                  <>
                    <p className="font-medium">{caseData.policy.policyNumber}</p>
                    <p className="text-muted-foreground">{caseData.policy.insuredName}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {caseData.policyNumberRaw
                      ? `"${caseData.policyNumberRaw}" — not matched`
                      : 'No policy number supplied'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4" /> Payout details
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {caseData.bankAccountNumber ? (
                  <>
                    <p className="font-medium">{caseData.bankName}</p>
                    <p>{caseData.bankAccountNumber}</p>
                    <p className="text-muted-foreground">{caseData.bankAccountHolderName}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Not provided yet</p>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEditable && (
                  <Button
                    className="w-full"
                    onClick={() =>
                      runAction(() => submitCase.mutateAsync(id), 'Case submitted for vetting')
                    }
                    disabled={submitCase.isPending}
                  >
                    <Send className="h-4 w-4 mr-1" /> Submit for vetting
                  </Button>
                )}

                {(isReviewable || canConvert) && (
                  <>
                    <Textarea
                      placeholder="Note for the claimant / file…"
                      value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                      rows={3}
                    />
                    <div className="grid grid-cols-1 gap-2">
                      {isReviewable && (
                        <Button
                          variant="outline"
                          disabled={!reviewNote.trim() || requestInfo.isPending}
                          onClick={() =>
                            runAction(
                              () => requestInfo.mutateAsync({ caseId: id, note: reviewNote }),
                              'Information requested from the claimant'
                            )
                          }
                        >
                          Request more info
                        </Button>
                      )}
                      {isReviewable && isMedical && (
                        <Button
                          variant="outline"
                          disabled={!reviewNote.trim() || referExpert.isPending}
                          onClick={() =>
                            runAction(
                              () => referExpert.mutateAsync({ caseId: id, note: reviewNote }),
                              'Referred to a claims expert'
                            )
                          }
                        >
                          Refer to expert
                        </Button>
                      )}
                      <Button
                        disabled={!canConvert || convertCase.isPending}
                        onClick={() =>
                          runAction(
                            () => convertCase.mutateAsync(id),
                            'Case converted to a claim'
                          )
                        }
                      >
                        Convert to claim
                      </Button>
                      {isMedical && isReviewable && !canConvert && (
                        <p className="text-xs text-muted-foreground">
                          Medical cases must be referred to an expert before conversion.
                        </p>
                      )}
                      <Button
                        variant="destructive"
                        disabled={!reviewNote.trim() || rejectCase.isPending}
                        onClick={() =>
                          runAction(
                            () => rejectCase.mutateAsync({ caseId: id, note: reviewNote }),
                            'Case rejected'
                          )
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                )}

                {!isEditable && !isReviewable && !canConvert && (
                  <p className="text-sm text-muted-foreground">
                    No actions available in this status.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

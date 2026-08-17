import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  FileQuestion,
  FileText,
  Landmark,
  Pencil,
  Search,
  Send,
  Upload,
  UserRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { EvidenceViewer, type EvidenceDocument } from '@/components/cases/evidence-viewer';
import { getCategoryConfig } from '@/lib/category-config';
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
  ANSWER_MASK_PREFIX,
  CASE_FLOWS,
  TRAVEL_CLAIM_TYPE_LABELS,
  TravelClaimType,
  checkPayeeName,
  formatDateAnswer,
  type FlowStep,
} from '@tci/shared-types';
import { NativeSelect } from '@/components/ui/native-select';
import {
  caseKeys,
  useCase,
  useConvertCase,
  useCorrectAnswer,
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
  const [viewing, setViewing] = useState<EvidenceDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flow = caseData?.travelClaimType
    ? CASE_FLOWS[caseData.travelClaimType as TravelClaimType]
    : null;

  /**
   * What the claimant told us, labelled.
   *
   * A travel case has a question flow, so each answer is labelled by the step
   * that asked it. Property lines have no flow yet — but they do have answers,
   * and resolving labels only through the flow meant a fire case showed
   * "No answers captured yet" while holding a risk address and a loss date.
   * Falling back to the answer key keeps the operator's vetting screen honest
   * until those flows exist.
   */
  const answeredSteps = useMemo(() => {
    if (!caseData?.answers) return [] as Array<{ step: FlowStep; value: string }>;

    if (flow) {
      return flow.steps
        .filter(step => step.answerType !== 'confirm' && caseData.answers?.[step.id] !== undefined)
        .map(step => ({ step, value: String(caseData.answers[step.id]) }));
    }

    return Object.entries(caseData.answers)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => ({
        step: {
          id: key,
          label: convertToTitleCase(key.replace(/-/g, ' ')),
          prompt: '',
          answerType: 'text',
        } as FlowStep,
        value: String(value),
      }));
  }, [flow, caseData]);

  /**
   * The name the claimant gave during intake.
   *
   * `Claimant.fullName` is deliberately not written until the case is converted
   * to a claim — see the comment in `cases.service.ts` `convertToClaim()`: a
   * name typed into a chat must never overwrite a better-verified one from eKYC
   * or a staff-entered record. That rule is right, but it left this panel
   * showing "Unknown" while the answers column two inches away displayed the
   * name in full, which reads to an adjuster as data loss rather than as a
   * deliberate deferral.
   *
   * So: show what the claimant stated, and label it as stated rather than
   * verified. The database rule is untouched.
   */
  const statedName = useMemo(() => {
    const value = caseData?.answers?.['claimant-name'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }, [caseData]);

  /**
   * Whether the person claiming is the person being paid. Never blocks — the
   * rule surfaces the divergence and the adjuster decides. See
   * `payee-name-check.ts` for why the comparison is deliberately conservative.
   */
  const payeeCheck = useMemo(() => checkPayeeName(caseData?.answers), [caseData]);

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
          /* Travel carries a subtype; every other line is named by itself. The
             fallback used to read "Travel claim request" on a fire case. */
          `${
            caseData.travelClaimType
              ? TRAVEL_CLAIM_TYPE_LABELS[caseData.travelClaimType as TravelClaimType]
              : getCategoryConfig(caseData.category).label
          } — ${convertToTitleCase(String(caseData.channel))} intake`
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
                  <p className="text-sm text-muted-foreground">
                    {/* A notification that arrived by email or was captured by
                        staff has no conversational intake. Saying "not yet"
                        implies something is missing that never was. */}
                    {caseData.channel === 'EMAIL' || caseData.channel === 'STAFF'
                      ? 'Captured from the notification — this channel has no question flow.'
                      : 'No answers captured yet.'}
                  </p>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {answeredSteps.map(({ step, value }) => (
                      <AnswerRow
                        key={step.id}
                        caseId={id}
                        step={step}
                        value={value}
                        editable={isEditable}
                      />
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
                      // Clickable, because vetting means looking at the
                      // evidence rather than at a filename.
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setViewing(doc)}
                        className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-sm hover:bg-muted/60"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{doc.fileName}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary">{convertToTitleCase(doc.documentType)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(doc.createdAt), 'dd MMM')}
                          </span>
                        </span>
                      </button>
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
                {caseData.claimant?.fullName ? (
                  <p className="font-medium">{caseData.claimant.fullName}</p>
                ) : statedName ? (
                  <>
                    <p className="font-medium">{statedName}</p>
                    <Badge variant="outline" className="font-normal">
                      Stated at intake · not verified
                    </Badge>
                  </>
                ) : (
                  <p className="font-medium text-muted-foreground">Unknown</p>
                )}
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
                {caseData.bankAccountLast4 ? (
                  <>
                    <p className="font-medium">{caseData.bankName}</p>
                    <p className="font-mono">•••• {caseData.bankAccountLast4}</p>
                    <p className="text-muted-foreground">{caseData.bankAccountHolderName}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Not provided yet</p>
                )}

                {/*
                  A payee who is not the claimant is usually innocent — a parent,
                  a spouse, a company card — and is also what payout diversion
                  looks like. Surfaced, never blocking: rejection stays a human
                  decision (MASTER_PLAN §3.2).
                */}
                {payeeCheck.shouldWarn && (
                  <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 mt-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-amber-900 dark:text-amber-200">
                        {payeeCheck.verdict === 'mismatch'
                          ? 'Payee differs from the claimant'
                          : 'Check the payee against the claimant'}
                      </p>
                      <p className="text-muted-foreground">
                        Claim is in the name of {payeeCheck.claimantName}; the account
                        is held by {payeeCheck.payeeName}.
                      </p>
                    </div>
                  </div>
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

      {viewing && (
        <EvidenceViewer caseId={id!} document={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/**
 * One intake answer, with the staff correction affordance where it is lawful.
 *
 * Editable only while the claimant themselves could still change the answer
 * (the page's isEditable — DRAFT / IN_PROGRESS / INFO_REQUESTED), and never
 * for a document (that is the upload path), a masked value (payout details
 * keep their own gated path) or a review confirmation. The pencil goes
 * through the audited corrections endpoint, not the conversational patch —
 * MASTER_PLAN §6 item 21 is the decision this screen implements.
 */
function AnswerRow({
  caseId,
  step,
  value,
  editable,
}: {
  caseId: string;
  step: FlowStep;
  value: string;
  editable: boolean;
}) {
  const { toast } = useToast();
  const correct = useCorrectAnswer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const masked = value.startsWith(ANSWER_MASK_PREFIX);
  const canCorrect =
    editable &&
    !masked &&
    step.answerType !== 'document' &&
    step.answerType !== 'confirm' &&
    !step.isReview;

  const display =
    step.answerType === 'document'
      ? 'Uploaded'
      : step.answerType === 'choice'
        ? convertToTitleCase(value)
        : step.answerType === 'date' || step.answerType === 'datetime'
          ? /* The same formatter the bot's review summary uses, so the operator
               reads the words the claimant confirmed — not the raw ISO string
               this screen used to print. Null on an unparseable value falls
               back to showing it verbatim. */
            formatDateAnswer(String(value), step.answerType) ?? value
          : value;

  const beginEdit = () => {
    // HTML date controls speak exactly the ISO prefix the stored value carries.
    if (step.answerType === 'date') setDraft(value.slice(0, 10));
    else if (step.answerType === 'datetime') setDraft(value.slice(0, 16));
    else setDraft(value);
    setEditing(true);
  };

  const save = async () => {
    if (!draft.trim() || draft === value) {
      setEditing(false);
      return;
    }
    const result = await correct.mutateAsync({
      caseId,
      stepId: step.id,
      value: step.answerType === 'number' ? Number(draft) : draft.trim(),
    });
    if (!result.accepted) {
      // The flow's own validation message — the same words the claimant
      // would have been given for the same mistake.
      toast({ title: 'Not saved', description: result.error, variant: 'destructive' });
      return;
    }
    setEditing(false);
    toast({
      title: 'Answer corrected',
      description: 'Recorded in the audit trail with the previous value.',
    });
  };

  return (
    <div className="text-sm group">
      <dt className="text-muted-foreground">{step.label}</dt>
      <dd className="font-medium break-words">
        {!editing && (
          <span className="inline-flex items-center gap-1.5">
            {display}
            {canCorrect && (
              <button
                type="button"
                onClick={beginEdit}
                aria-label={`Correct ${step.label}`}
                title="Correct this answer (audited)"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
        {editing && (
          <span className="flex items-center gap-1.5 mt-0.5">
            {step.answerType === 'choice' && step.choices ? (
              <NativeSelect
                value={draft}
                autoFocus
                onChange={event => setDraft(event.target.value)}
              >
                {step.choices.map(choice => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <input
                className="rounded-md border bg-background px-2 py-1 text-sm w-full max-w-[240px]"
                type={
                  step.answerType === 'number'
                    ? 'number'
                    : step.answerType === 'date'
                      ? 'date'
                      : step.answerType === 'datetime'
                        ? 'datetime-local'
                        : 'text'
                }
                value={draft}
                autoFocus
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void save();
                  if (event.key === 'Escape') setEditing(false);
                }}
              />
            )}
            <Button size="sm" onClick={() => void save()} disabled={correct.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </span>
        )}
      </dd>
    </div>
  );
}

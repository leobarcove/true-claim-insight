import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  Eye,
  Download,
  List,
  Grid,
  Loader2,
  Database,
  Brain,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { Header } from '@/components/layout/header';
import { Button, Badge, Skeleton } from '@/components/ui';
import { InfoTooltip } from '@/components/ui/tooltip';
import { useClaim } from '@/hooks/use-claims';
import { useTrinityCheck, useDocumentAnalysis } from '@/hooks/use-trinity';
import { useQueryClient } from '@tanstack/react-query';
import { trinityKeys } from '@/hooks/use-trinity';

export function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: claim, isLoading: loadingClaim } = useClaim(id!);
  const { data: trinityCheck, isLoading: loadingTrinity } = useTrinityCheck(id!);
  const queryClient = useQueryClient();

  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [previewError, setPreviewError] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // WebSocket for real-time updates
  useEffect(() => {
    if (!id) return;

    // Use environment variable or default to localhost:3004 (risk-engine)
    const socket = io('http://localhost:3004/events', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to risk-engine events');
      socket.emit('join-claim', id);
    });

    socket.on('document-status-update', (data: { documentId: string; status: string }) => {
      console.log('Document status update received:', data);
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['claims', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: trinityKeys.analysis(data.documentId) });
    });

    socket.on('trinity-update', (data: { claimId: string; status: string }) => {
      console.log('Trinity check update received:', data);
      queryClient.invalidateQueries({ queryKey: trinityKeys.check(id) });
    });

    return () => {
      socket.disconnect();
    };
  }, [id, queryClient]);

  const { data: analysis, isLoading: loadingAnalysis } = useDocumentAnalysis(selectedDoc?.id);
  const sortedDocuments = claim?.documents
    ? [...claim.documents].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    : [];

  // Reset error when doc changes
  useEffect(() => {
    setPreviewError(false);
  }, [selectedDoc]);

  // Auto-select first document when loaded
  useEffect(() => {
    if (sortedDocuments.length > 0 && !selectedDoc) {
      setSelectedDoc(sortedDocuments[0]);
    }
  }, [sortedDocuments, selectedDoc]);

  const isLoading = loadingClaim || loadingTrinity;

  // Derive checks list from trinityCheck
  const trinityChecks = trinityCheck?.checkResults
    ? Object.entries(trinityCheck.checkResults).map(([key, value]: [string, any]) => ({
        id: key,
        ...value,
      }))
    : [];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header
        title="Trinity Cross-Checks"
        description={
          <span className="font-medium text-muted-foreground">
            Claim: {claim?.claimNumber || id}
          </span>
        }
      >
        <Button variant="outline" size="sm" onClick={() => navigate('/documents')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      {isLoading ? (
        /* High-level skeleton loading */
        <div className="flex-1 p-4 overflow-hidden">
          <div className="flex flex-col h-full gap-4">
            {/* Top Section Skeleton: Documents + Preview + Data */}
            <div className="flex-1 grid grid-cols-12 gap-4 h-[60%] min-h-[400px]">
              {/* Documents Pane Skeleton */}
              <div className="col-span-3">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
              {/* Preview Pane Skeleton */}
              <div className="col-span-6">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
              {/* Data Pane Skeleton */}
              <div className="col-span-3">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
            </div>

            {/* Trinity Section Skeleton */}
            <div className="h-[40%]">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 overflow-hidden">
          <div className="flex flex-col h-full gap-4">
            {/* Top Section: Split 3 Panes */}
            <div className="flex-1 grid grid-cols-12 gap-4 h-[60%] min-h-[400px]">
              {/* Left Pane: Document List */}
              <div className="col-span-3 bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden">
                <div className="py-2 px-4 border-b bg-muted/50 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Documents</h3>
                  <div className="flex items-center bg-muted/50 rounded-lg p-1">
                    <InfoTooltip
                      content="List"
                      direction="top"
                      fontSize="text-[11px]"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 rounded-md ${viewMode === 'list' ? 'bg-background shadow-sm' : ''}`}
                          onClick={() => setViewMode('list')}
                        >
                          <List className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <InfoTooltip
                      content="Grid"
                      direction="top"
                      fontSize="text-[11px]"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 rounded-md ${viewMode === 'grid' ? 'bg-background shadow-sm' : ''}`}
                          onClick={() => setViewMode('grid')}
                        >
                          <Grid className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  {viewMode === 'list' ? (
                    <div className="p-2 space-y-1">
                      {sortedDocuments.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No documents found
                        </div>
                      ) : (
                        sortedDocuments.map((doc: any) => (
                          <button
                            key={doc.id}
                            onClick={() => setSelectedDoc(doc)}
                            className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${
                              selectedDoc?.id === doc.id
                                ? 'bg-primary/20 border-primary/30 border'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className="relative">
                              <div
                                className={`flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center ${
                                  selectedDoc?.id === doc.id ? 'bg-card' : 'bg-muted'
                                }`}
                              >
                                {doc.type === 'DAMAGE_PHOTO' ? (
                                  <ImageIcon className="h-4 w-4" />
                                ) : (
                                  <FileText className="h-4 w-4" />
                                )}
                              </div>
                              {/* Document State Icon in top-right of file icon */}
                              <div className="absolute -top-1 -right-1 bg-background rounded-full p-0.5 shadow-sm border border-border/50">
                                {doc.status === 'QUEUED' || doc.status === 'PROCESSING' ? (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                                ) : doc.status === 'COMPLETED' ? (
                                  <Check className="h-2.5 w-2.5 text-green-500" />
                                ) : doc.status === 'FAILED' ? (
                                  <X className="h-2.5 w-2.5 text-red-500" />
                                ) : null}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p
                                  className={`text-sm font-medium truncate ${selectedDoc?.id === doc.id ? 'text-primary' : 'text-foreground'}`}
                                >
                                  {doc.filename || doc.name}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : '0 KB'}
                                </span>
                                <span className="text-[10px] text-muted-foreground">•</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {doc.type.replace(/_/gi, ' ')}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="p-2 grid grid-cols-2 gap-2">
                      {sortedDocuments.length === 0 ? (
                        <div className="col-span-2 p-4 text-center text-muted-foreground text-sm">
                          No documents found
                        </div>
                      ) : (
                        sortedDocuments.map((doc: any) => (
                          <button
                            key={doc.id}
                            onClick={() => setSelectedDoc(doc)}
                            className={`text-left p-3 rounded-lg flex flex-col gap-2 transition-colors ${
                              selectedDoc?.id === doc.id
                                ? 'bg-primary/20 border-primary/30 border'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className="relative w-full">
                              <div
                                className={`w-full h-16 rounded-md flex items-center justify-center ${
                                  selectedDoc?.id === doc.id ? 'bg-card' : 'bg-muted'
                                }`}
                              >
                                {doc.type === 'DAMAGE_PHOTO' ? (
                                  <ImageIcon className="h-6 w-6" />
                                ) : (
                                  <FileText className="h-6 w-6" />
                                )}
                              </div>
                              {/* Document State Icon in top-right of file icon */}
                              <div className="absolute -top-1 -right-1 bg-background rounded-full p-0.5 shadow-sm border border-border/50">
                                {doc.status === 'PROCESSING' || doc.status === 'QUEUED' ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                ) : doc.status === 'COMPLETED' ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : doc.status === 'FAILED' ? (
                                  <X className="h-3 w-3 text-red-500" />
                                ) : null}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p
                                  className={`text-xs font-medium truncate ${selectedDoc?.id === doc.id ? 'text-primary' : 'text-foreground'}`}
                                >
                                  {doc.filename || doc.name}
                                </p>
                              </div>
                              <div className="flex flex-col gap-0.5 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : '0 KB'}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {doc.type.replace(/_/gi, ' ')}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Middle Pane: Preview */}
              <div className="col-span-6 bg-muted/30 rounded-xl overflow-hidden shadow-sm flex flex-col relative items-center justify-center border border-border">
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 bg-background/80 hover:bg-background/90 text-foreground shadow-sm"
                    onClick={() =>
                      selectedDoc?.storageUrl && window.open(selectedDoc.storageUrl, '_blank')
                    }
                    title="View in new tab"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 bg-background/80 hover:bg-background/90 text-foreground shadow-sm"
                    onClick={async () => {
                      if (selectedDoc?.storageUrl) {
                        try {
                          const response = await fetch(selectedDoc.storageUrl);
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = selectedDoc.filename || 'download';
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Download failed:', error);
                          window.open(selectedDoc.storageUrl, '_blank');
                        }
                      }
                    }}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>

                {/* Preview */}
                <div className="w-full h-full flex flex-col items-center justify-center">
                  {selectedDoc ? (
                    <>
                      {!previewError &&
                      (selectedDoc.mimeType?.startsWith('image/') ||
                        selectedDoc.type === 'DAMAGE_PHOTO' ||
                        selectedDoc.type === 'MYKAD_FRONT') ? (
                        <div className="relative w-full h-full flex items-center justify-center p-4">
                          <img
                            src={selectedDoc.storageUrl}
                            alt="Preview"
                            className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
                            onError={() => setPreviewError(true)}
                          />
                        </div>
                      ) : !previewError &&
                        (selectedDoc.mimeType === 'application/pdf' ||
                          selectedDoc.filename?.endsWith('.pdf')) ? (
                        <iframe
                          src={selectedDoc.storageUrl}
                          className="w-full h-full bg-white"
                          title="PDF Preview"
                          onError={() => setPreviewError(true)}
                        />
                      ) : (
                        <div className="text-muted-foreground flex flex-col items-center gap-4 animate-in fade-in duration-300">
                          <div className="w-12 h-12">
                            <FileText className="h-12 w-12 text-muted-foreground/30" />
                          </div>
                          <div className="text-center space-y-1">
                            <p className="font-medium text-foreground">No Preview Available</p>
                            <p className="text-xs text-muted-foreground">
                              {previewError
                                ? 'The file could not be loaded.'
                                : `Preview format not supported for ${selectedDoc.filename || selectedDoc.name}`}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-muted-foreground flex flex-col items-center gap-4">
                      <div className="w-12 h-12">
                        <FileText className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm">Select a file to preview</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Pane: Extracted Data */}
              <div className="col-span-3 bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden">
                <div className="py-2.5 px-4 border-b bg-muted/50 flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Extracted Data</h3>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {loadingAnalysis ? (
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : analysis?.extractedData ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                      {Object.entries(analysis.extractedData).map(([key, value]) => {
                        if (key === 'confidence_score') return null;
                        if (Array.isArray(value)) {
                          return (
                            <div key={key} className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                {key.replace(/_/g, ' ')}
                              </label>
                              <div className="flex flex-wrap gap-1">
                                {value.map((item: any, i: number) => (
                                  <Badge
                                    key={i}
                                    variant="secondary"
                                    className="text-[10px] py-0 px-1.5 h-5"
                                  >
                                    {typeof item === 'string' ? item : JSON.stringify(item)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={key}
                            className="space-y-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                          >
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                              {key.replace(/_/g, ' ')}
                            </label>
                            <p className="text-sm font-medium">
                              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : selectedDoc?.status === 'QUEUED' || selectedDoc?.status === 'PROCESSING' ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Analysis in Progress</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        AI is currently processing this document.
                      </p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Database className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No Extraction Data</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Section: True Claim Intelligence */}
            <div className="h-[40%] bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b bg-muted/50 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">True Claim Intelligence</h3>
                {trinityCheck && (
                  <Badge
                    variant={
                      trinityCheck.status === 'VERIFIED'
                        ? 'success'
                        : trinityCheck.status === 'FLAGGED'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {trinityCheck.status}
                  </Badge>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {!trinityCheck ? (
                    <div className="col-span-full p-8 text-center text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No Trinity analysis data available for this claim yet.</p>
                    </div>
                  ) : (
                    trinityChecks.map((check: any) => (
                      <div
                        key={check.id}
                        className={`p-4 rounded-lg border-2 transition-colors ${
                          check.is_pass === true
                            ? 'border-green-500/30 bg-green-500/5'
                            : check.is_pass === false
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-yellow-500/30 bg-yellow-500/5'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm">
                            {check.name || check.id.replace(/_/g, ' ').toUpperCase()}
                          </h4>
                          {check.is_pass === true ? (
                            <Check className="h-5 w-5 text-green-600" />
                          ) : check.is_pass === false ? (
                            <X className="h-5 w-5 text-red-600" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{check.details}</p>
                        {check.confidence !== undefined && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Confidence:</span>
                            <span className="font-medium">
                              {(check.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Intelligence Reasoning Section */}
                {trinityCheck?.reasoning && (
                  <div className="mt-8 border-t pt-8">
                    <div className="flex items-start gap-4 p-6 bg-primary/5 rounded-2xl border border-primary/20 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Brain className="h-24 w-24 -mr-8 -mt-8 rotate-12" />
                      </div>
                      <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <Brain className="h-6 w-6 text-primary" />
                      </div>
                      <div className="space-y-4 flex-1 relative z-10">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-lg text-foreground">
                              Intelligence Reasoning
                            </h4>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              Powered by DeepSeek-R1 • Confidence:{' '}
                              {((trinityCheck.reasoningInsights?.confidence || 0.95) * 100).toFixed(
                                0
                              )}
                              %
                            </p>
                          </div>
                          {trinityCheck.reasoningInsights?.recommendation && (
                            <Badge
                              className={`px-3 py-1 text-xs font-bold ${
                                trinityCheck.reasoningInsights.recommendation === 'APPROVE'
                                  ? 'bg-green-500 hover:bg-green-600'
                                  : trinityCheck.reasoningInsights.recommendation === 'REJECT'
                                    ? 'bg-red-500 hover:bg-red-600'
                                    : 'bg-amber-500 hover:bg-amber-600'
                              }`}
                            >
                              Recommend: {trinityCheck.reasoningInsights.recommendation}
                            </Badge>
                          )}
                        </div>
                        <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
                          <p className="whitespace-pre-wrap">{trinityCheck.reasoning}</p>
                        </div>
                        {trinityCheck.reasoningInsights?.insights && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                            {trinityCheck.reasoningInsights.insights.map(
                              (insight: string, i: number) => (
                                <div
                                  key={i}
                                  className="flex gap-2 p-3 bg-background/50 rounded-lg border border-border/50 text-xs shadow-sm"
                                >
                                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                                  <span>{insight}</span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

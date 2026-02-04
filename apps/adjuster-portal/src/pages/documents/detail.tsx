import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
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
import { convertToTitleCase } from '@/lib/utils';

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

  const { data: analysisResponse, isLoading: loadingAnalysis } = useDocumentAnalysis(
    selectedDoc?.id
  );
  const analysisData = (analysisResponse as any)?.data;
  const extractedData = analysisData?.extractedData;
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

  const trinityData = (trinityCheck as any)?.data;
  const trinityChecks = trinityData?.checkResults
    ? Object.entries(trinityData.checkResults).map(([key, value]: [string, any]) => ({
        id: key,
        ...value,
      }))
    : [];

  if (isLoading) {
    return (
      <div className="flex flex-col h-full space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="h-full flex flex-col gap-4">
          <div className="h-[600px] flex-[2] grid grid-cols-12 gap-4">
            <Skeleton className="col-span-3 h-full rounded-xl" />
            <Skeleton className="col-span-6 h-full rounded-xl" />
            <Skeleton className="col-span-3 h-full rounded-xl" />
          </div>
          <Skeleton className="flex-1 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-6">
          <div className="h-[550px] grid grid-cols-12 gap-4">
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
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">
                                {doc.type.replace(/_/gi, ' ')}
                              </span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground">
                                {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : '0 KB'}
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
                <InfoTooltip
                  content="View"
                  direction="top"
                  fontSize="text-[11px]"
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md bg-background shadow-sm"
                      onClick={() =>
                        selectedDoc?.storageUrl && window.open(selectedDoc.storageUrl, '_blank')
                      }
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  }
                />
                <InfoTooltip
                  content="Download"
                  direction="top"
                  fontSize="text-[11px]"
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md bg-background shadow-sm"
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
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  }
                />
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
              <div className="p-4 border-b bg-muted/50 flex items-center justify-between">
                <h3 className="font-semibold text-sm">Extracted Data</h3>
                <Database className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loadingAnalysis ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : extractedData ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                    {(() => {
                      const flattenData = (data: any, prefix = ''): any[] => {
                        let items: any[] = [];
                        Object.entries(data).forEach(([key, value]) => {
                          if (key === 'confidence_score') return;
                          const currentKey = prefix ? `${prefix} ${key}` : key;
                          if (value && typeof value === 'object' && !Array.isArray(value)) {
                            items = [...items, ...flattenData(value, currentKey)];
                          } else {
                            items.push({ key: currentKey, value });
                          }
                        });
                        return items;
                      };

                      const renderValue = (val: any) => {
                        if (val === null || val === undefined) return '-';
                        if (['true', 'false'].includes(val)) return val ? 'Yes' : 'No';
                        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
                        if (typeof val === 'string')
                          return <span dangerouslySetInnerHTML={{ __html: val }} />;
                        if (Array.isArray(val)) {
                          if (val.length === 0) return '-';
                          if (typeof val[0] === 'object') {
                            // Dynamic Table for Array of Objects
                            const headers = Object.keys(val[0]);
                            return (
                              <div className="overflow-x-auto rounded-md border border-border/50 mt-1.5">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-muted/50 text-muted-foreground font-medium uppercase tracking-wider">
                                    <tr>
                                      {headers.map((h, i) => (
                                        <th key={i} className="px-3 py-2 whitespace-nowrap">
                                          {h.replace(/_/g, ' ')}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50 bg-card">
                                    {val.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-muted/20">
                                        {headers.map((h, j) => (
                                          <td
                                            key={j}
                                            className="px-3 py-2 whitespace-nowrap text-foreground"
                                          >
                                            {row[h] === null || row[h] === undefined ? (
                                              '-'
                                            ) : typeof row[h] === 'string' ? (
                                              <span dangerouslySetInnerHTML={{ __html: row[h] }} />
                                            ) : (
                                              String(row[h])
                                            )}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          }
                          // Array of Strings/Primitives
                          const joined = val
                            .map((v: any) => (typeof v === 'string' ? v : String(v)))
                            .join(', ');
                          return <span dangerouslySetInnerHTML={{ __html: joined }} />;
                        }
                        return String(val);
                      };

                      const items = flattenData(extractedData);
                      return items.map((item, idx) => (
                        <div
                          key={item.key}
                          className={`space-y-0.5 border-b border-border/50 pb-2 ${
                            idx === items.length - 1 ? 'border-0 pb-0' : ''
                          }`}
                        >
                          <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                            {item.key.replace(/_/g, ' ')}
                          </label>
                          <div className="text-sm font-medium">{renderValue(item.value)}</div>
                        </div>
                      ));
                    })()}
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
                    <p className="text-sm font-medium text-foreground">No Data</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Fraud Score Section */}
          <div className="bg-card rounded-xl border shadow-sm flex flex-col">
            <div className="p-4 border-b bg-muted/50 flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                Fraud Score Analysis
              </h4>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              {!trinityData ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No fraud analysis data available yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trinityChecks
                    .sort((a: any, b: any) => {
                      // 1. Sort by Status: Failed > Warning > Passed
                      const getStatusWeight = (check: any) => {
                        if (check.is_pass === false) return 3; // Failed
                        if (check.is_pass === undefined || check.is_pass === null) return 2; // Warning
                        return 1; // Passed
                      };
                      const weightA = getStatusWeight(a);
                      const weightB = getStatusWeight(b);
                      if (weightA !== weightB) return weightB - weightA; // Higher weight first

                      // 2. Sort by Priority: Critical > High > Medium > Low
                      const priorityOrder: Record<string, number> = {
                        CRITICAL: 4,
                        HIGH: 3,
                        MEDIUM: 2,
                        LOW: 1,
                      };
                      const pA = priorityOrder[a.priority] || 0;
                      const pB = priorityOrder[b.priority] || 0;
                      return pB - pA;
                    })
                    .map((check: any) => (
                      <div
                        key={check.id}
                        className={`group flex items-center justify-between p-3 rounded-lg border transition-all duration-200 hover:shadow-sm ${
                          check.is_pass === true
                            ? 'bg-card hover:bg-green-500/5 hover:border-green-500/30 border-border/60'
                            : check.is_pass === false
                              ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                              : 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10'
                        }`}
                      >
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Status Icon */}
                          <div
                            className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
                              check.is_pass === true
                                ? 'bg-green-500/10 border-green-500/20 text-green-600'
                                : check.is_pass === false
                                  ? 'bg-red-500/10 border-red-500/20 text-red-600'
                                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600'
                            }`}
                          >
                            {check.is_pass === true ? (
                              <Check className="h-4 w-4" />
                            ) : check.is_pass === false ? (
                              <X className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-semibold tracking-tight text-foreground">
                                {check.name ||
                                  convertToTitleCase(check.check_id.split('_').slice(1).join('_'))}
                              </h5>
                            </div>
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-1 group-hover:line-clamp-none group-hover:text-foreground/80 transition-colors">
                              {check.details}
                            </p>
                          </div>
                        </div>

                        {/* Metadata Right */}
                        {check.confidence !== undefined && (
                          <div className="flex items-center gap-4 pl-4 border-l border-border/50 ml-4">
                            <div className="text-center">
                              <div className="text-xs font-bold uppercase tracking-wider">
                                {(check.confidence * 100).toFixed(0)}%
                              </div>
                              <div className="text-[10px] text-muted-foreground font-medium">
                                Confidence
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. True Claim Intelligence Section */}
          <div className="bg-card rounded-xl border shadow-sm flex flex-col">
            <div className="p-4 border-b bg-muted/50">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                True Claim Intelligence
              </h4>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              {trinityData?.reasoning ? (
                <div className="animate-in fade-in duration-700 h-full">
                  <div className="flex flex-col lg:flex-row gap-6 h-full">
                    {/* reasoning section */}
                    <div className="flex-1 bg-primary/5 rounded-2xl border border-primary/20 p-6 relative overflow-hidden flex flex-col">
                      <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                        <Brain className="h-32 w-32 rotate-12" />
                      </div>
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                              <Brain className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-bold text-sm">Reasoning Analysis</h4>
                              <p className="text-[10px] text-muted-foreground">
                                Confidence:{' '}
                                {(
                                  (trinityData.reasoningInsights?.confidence || 0.95) * 100
                                ).toFixed(0)}
                                %
                              </p>
                            </div>
                          </div>
                          {trinityData.reasoningInsights?.recommendation && (
                            <Badge
                              className={`px-3 py-1 text-[10px] font-black tracking-tighter shadow-sm ${
                                trinityData.reasoningInsights.recommendation === 'APPROVE'
                                  ? 'bg-green-500 hover:bg-green-600'
                                  : trinityData.reasoningInsights.recommendation === 'REJECT'
                                    ? 'bg-red-500 hover:bg-red-600'
                                    : 'bg-amber-500 hover:bg-amber-600'
                              }`}
                            >
                              RECOMMEND: {trinityData.reasoningInsights.recommendation}
                            </Badge>
                          )}
                        </div>
                        <div className="flex-1 overflow-auto prose prose-sm max-w-none text-foreground leading-relaxed text-xs md:text-sm">
                          <p className="whitespace-pre-wrap opacity-90">{trinityData.reasoning}</p>
                        </div>
                      </div>
                    </div>

                    {/* Insights side panel */}
                    {trinityData.reasoningInsights?.insights && (
                      <div className="lg:w-1/3 space-y-3 overflow-auto">
                        <h5 className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-2 px-1">
                          <Check className="h-3 w-3" /> Key Insights
                        </h5>
                        {trinityData.reasoningInsights.insights.map(
                          (insight: string, i: number) => (
                            <div
                              key={i}
                              className="p-3 bg-card rounded-xl border border-border/50 text-xs shadow-sm hover:border-primary/30 transition-colors flex gap-3"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                              <span className="opacity-90">{insight}</span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                  <Brain className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No intelligence reasoning generated yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button, Badge, Skeleton } from '@/components/ui';
import { InfoTooltip } from '@/components/ui/tooltip';
import { useClaim } from '@/hooks/use-claims';
import { useTrinityCheck } from '@/hooks/use-trinity';
import { convertToTitleCase } from '@/lib/utils';

export function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: claim, isLoading: loadingClaim } = useClaim(id!);
  const { data: trinityCheck, isLoading: loadingTrinity } = useTrinityCheck(id!);

  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [previewError, setPreviewError] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Reset error when doc changes
  useEffect(() => {
    setPreviewError(false);
  }, [selectedDoc]);

  // Auto-select first document when loaded
  useEffect(() => {
    if (claim?.documents && claim.documents.length > 0 && !selectedDoc) {
      setSelectedDoc(claim.documents[0]);
    }
  }, [claim?.documents, selectedDoc]);

  const isLoading = loadingClaim || loadingTrinity;

  // Derive checks list from trinityCheck
  const trinityChecks = trinityCheck?.checks
    ? Object.entries(trinityCheck.checks).map(([key, value]: [string, any]) => ({
        id: key,
        ...value,
      }))
    : [];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header title={`Trinity Check: ${claim?.claimNumber || id}`} description="Deep Dive Analysis">
        <Button variant="outline" size="sm" onClick={() => navigate('/documents')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      <div className="flex-1 p-4 overflow-hidden">
        <div className="flex flex-col h-full gap-4">
          {/* Top Section: Split 3 Panes */}
          <div className="flex-1 grid grid-cols-12 gap-4 h-[60%] min-h-[400px]">
            {/* Left Pane: Document List */}
            <div className="col-span-3 bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b bg-muted/50 flex items-center justify-between">
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
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="p-2">
                          <Skeleton className="h-12 w-full" />
                        </div>
                      ))
                    ) : claim?.documents?.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        No documents found
                      </div>
                    ) : (
                      claim?.documents?.map((doc: any) => (
                        <button
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${
                            selectedDoc?.id === doc.id
                              ? 'bg-primary/20 border-primary/30 border'
                              : 'hover:bg-muted/50'
                          }`}
                        >
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
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium truncate ${selectedDoc?.id === doc.id ? 'text-primary' : 'text-foreground'}`}
                            >
                              {doc.filename || doc.name}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : '0 KB'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground">
                                {convertToTitleCase(doc.type)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="p-2 grid grid-cols-2 gap-2">
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="p-2">
                          <Skeleton className="h-24 w-full" />
                        </div>
                      ))
                    ) : claim?.documents?.length === 0 ? (
                      <div className="col-span-2 p-4 text-center text-muted-foreground text-sm">
                        No documents found
                      </div>
                    ) : (
                      claim?.documents?.map((doc: any) => (
                        <button
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className={`text-left p-3 rounded-lg flex flex-col gap-2 transition-colors ${
                            selectedDoc?.id === doc.id
                              ? 'bg-primary/20 border-primary/30 border'
                              : 'hover:bg-muted/50'
                          }`}
                        >
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
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs font-medium truncate ${selectedDoc?.id === doc.id ? 'text-primary' : 'text-foreground'}`}
                            >
                              {doc.filename || doc.name}
                            </p>
                            <div className="flex flex-col gap-0.5 mt-1">
                              <span className="text-[10px] text-muted-foreground">
                                {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : '0 KB'}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {convertToTitleCase(doc.type)}
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
            <div className="col-span-9 bg-muted/30 rounded-xl overflow-hidden shadow-sm flex flex-col relative items-center justify-center border border-border">
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
                  onClick={() => {
                    if (selectedDoc?.storageUrl) {
                      const link = document.createElement('a');
                      link.href = selectedDoc.storageUrl;
                      link.download = selectedDoc.filename || 'download';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
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
                              ? 'The file could not be loaded or is corrupted.'
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
          </div>

          {/* Bottom Section: Trinity Analysis (Full Width) */}
          <div className="h-[40%] bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Trinity Cross-Check Results</h3>
                <Badge
                  className="ml-2"
                  variant={
                    trinityCheck?.status === 'VERIFIED'
                      ? 'success'
                      : trinityCheck?.status === 'FLAGGED'
                        ? 'warning'
                        : 'default'
                  }
                >
                  Score: {trinityCheck?.totalScore ?? 'N/A'}/100
                </Badge>
              </div>
              <Button size="sm">Export Report</Button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))
                ) : !trinityCheck ? (
                  <div className="col-span-4 text-center text-slate-500 p-8">
                    No Trinity analysis data available for this claim.
                  </div>
                ) : (
                  trinityChecks.map((check: any) => (
                    <div
                      key={check.id}
                      className={`border rounded-lg p-4 flex flex-col gap-2 ${
                        check.status === 'FAIL'
                          ? 'bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900'
                          : check.status === 'WARN'
                            ? 'bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900'
                            : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">
                          {check.name || check.check_id}
                        </span>
                        {check.is_pass === true ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : check.is_pass === false ? (
                          <X className="h-4 w-4 text-destructive" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-warning" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {check.details}
                      </p>
                      <div className="mt-auto pt-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            check.status === 'FAIL'
                              ? 'bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-100'
                              : check.status === 'WARN' || check.priority === 'HIGH'
                                ? 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
                                : 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                          }`}
                        >
                          {check.status || (check.is_pass ? 'PASS' : 'FAIL')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

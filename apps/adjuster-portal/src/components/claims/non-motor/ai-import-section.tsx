/**
 * AI Document Import section — sits at the top of the flood FNOL form.
 * Mirrors the motor wizard's pattern: file slots for the documents the
 * extraction webhook can parse, a "Process" button that calls
 * /ocr/extract, and an onExtracted callback that the parent form uses to
 * populate fields via react-hook-form's setValue.
 *
 * Only NRIC/MyKad and Policy Document have meaningful structured
 * extraction today; the other slots are document attachments for later.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Sparkles, Upload, X, type LucideIcon, User, FileText, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAiExtraction,
  type ExtractionResult,
} from '@/hooks/use-ai-extraction';

export interface FloodImportFiles {
  mykad: File | null;
  policy_document: File | null;
  damaged_evidence: File | null;
}

interface Slot {
  id: keyof FloodImportFiles;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SLOTS: Slot[] = [
  {
    id: 'mykad',
    label: 'NRIC / MyKad (front)',
    description: 'Extracts claimant name and NRIC',
    icon: User,
  },
  {
    id: 'policy_document',
    label: 'Policy Document',
    description: 'Extracts policy number',
    icon: FileText,
  },
  {
    id: 'damaged_evidence',
    label: 'Damage Photo (optional)',
    description: 'Watermark / property photo for the record',
    icon: Camera,
  },
];

interface Props {
  onExtracted: (extraction: ExtractionResult) => void;
}

export function AiImportSection({ onExtracted }: Props) {
  const [files, setFiles] = useState<FloodImportFiles>({
    mykad: null,
    policy_document: null,
    damaged_evidence: null,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const { extractData, isExtracting, error: extractError } = useAiExtraction();

  const anyFile = Object.values(files).some(Boolean);

  const pickFile = (id: keyof FloodImportFiles) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.onchange = (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setLocalError('File size exceeds 5MB');
        return;
      }
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        setLocalError('Only PDF or image files are allowed');
        return;
      }
      setLocalError(null);
      setFiles(prev => ({ ...prev, [id]: file }));
    };
    input.click();
  };

  const handleProcess = async () => {
    const result = await extractData(files as unknown as Record<string, File | null>);
    onExtracted(result);
  };

  const errorMessage = localError ?? extractError;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Document Import
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Upload the claimant's documents to auto-fill the form. Files are
          processed by the OCR pipeline; you can still edit any extracted
          value before submitting.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {SLOTS.map(slot => {
          const file = files[slot.id];
          const Icon = slot.icon;
          return (
            <div
              key={slot.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                file
                  ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30'
              )}
              onClick={() => pickFile(slot.id)}
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                  file
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {file ? <Check size={18} /> : <Icon size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{slot.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {file ? file.name : slot.description}
                </div>
              </div>
              {file && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setFiles(prev => ({ ...prev, [slot.id]: null }));
                  }}
                  className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}

        {errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}

        <div className="flex items-center justify-end pt-1">
          <Button
            type="button"
            onClick={handleProcess}
            disabled={!anyFile || isExtracting}
            size="sm"
          >
            {isExtracting ? (
              <>
                <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />
                Extracting…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Extract &amp; fill form
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

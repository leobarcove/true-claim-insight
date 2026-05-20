/**
 * Flood FNOL form — captures Claim base fields + FloodClaim sub-table
 * fields in one submission. Posts to /claims/flood through the api-
 * gateway (which resolves claimantNric + claimantPhone to a claimant
 * upsert before forwarding to case-service).
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Waves } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateFloodClaim } from '@/hooks/use-non-motor';
import { AiImportSection } from './ai-import-section';
import type { ExtractionResult } from '@/hooks/use-ai-extraction';

// Match the FloodSource / PropertyType enum values without importing the
// runtime enum (CJS-ESM interop dance — see category-config.tsx note).
const FLOOD_SOURCES = [
  'RIVER_OVERFLOW',
  'FLASH_FLOOD',
  'COASTAL_SURGE',
  'DRAINAGE_FAILURE',
  'RAINWATER_INGRESS',
  'DAM_RELEASE',
  'UNKNOWN',
] as const;

const PROPERTY_TYPES = [
  'RESIDENTIAL',
  'COMMERCIAL',
  'INDUSTRIAL',
  'MIXED_USE',
  'AGRICULTURAL',
  'OTHER',
] as const;

const MALAYSIAN_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
] as const;

const schema = z.object({
  claimantName: z.string().min(2, 'Required'),
  claimantNric: z
    .string()
    .min(6, 'Required')
    .regex(/^[0-9-]+$/, 'Digits and dashes only'),
  claimantPhone: z
    .string()
    .min(8, 'Required')
    .regex(/^\+?[0-9]+$/, 'Digits, optional leading +'),
  policyNumber: z.string().min(1, 'Required'),
  incidentDate: z.string().min(1, 'Required'),
  address: z.string().min(3, 'Required'),
  description: z.string().min(10, 'Describe the incident in a sentence or two'),
  // Flood-specific
  incidentStart: z.string().min(1, 'Required'),
  incidentEnd: z.string().optional(),
  waterDepthCm: z.coerce.number().int().min(0).optional(),
  durationHours: z.coerce.number().int().min(0).optional(),
  source: z.enum(FLOOD_SOURCES).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  propertyFloorLevel: z.coerce.number().int().min(-2).max(100).optional(),
  propertyElevationMeters: z.coerce.number().min(0).optional(),
  postcode: z.string().regex(/^[0-9]{0,5}$/, 'Up to 5 digits').optional(),
  state: z.string().optional(),
  buildingDamageRm: z.coerce.number().min(0).optional(),
  contentsDamageRm: z.coerce.number().min(0).optional(),
  vehicleDamageRm: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onCancel?: () => void;
}

export function FloodFNOLForm({ onCancel }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createFlood = useCreateFloodClaim();

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      incidentDate: new Date().toISOString().slice(0, 10),
      incidentStart: new Date().toISOString().slice(0, 16),
    },
  });

  /**
   * Map extraction webhook output to form fields. Only the documents the
   * webhook actually parses (mykad, policy_document) yield useful structured
   * data; the other slots are file attachments for the record.
   */
  const handleExtracted = (extraction: ExtractionResult) => {
    let appliedFields = 0;

    // MyKad: name + NRIC. Webhook returns slightly varying shapes, so we
    // probe a few common paths.
    const mykadDoc =
      extraction.mykad?.document?.front ??
      extraction.mykad?.document ??
      extraction.mykad?.data;
    if (mykadDoc) {
      const name = mykadDoc.name ?? mykadDoc.full_name;
      const nric = mykadDoc.identity_number ?? mykadDoc.nric ?? mykadDoc.ic_number;
      const address = mykadDoc.address ?? mykadDoc.full_address;
      if (name) {
        setValue('claimantName', String(name), { shouldValidate: true });
        appliedFields++;
      }
      if (nric) {
        setValue('claimantNric', String(nric), { shouldValidate: true });
        appliedFields++;
      }
      // MyKad address often makes a good default for property address.
      if (address) {
        setValue('address', String(address), { shouldValidate: true });
        appliedFields++;
      }
    }

    // Policy: policy number.
    const policyDoc =
      extraction.policy_document?.document ?? extraction.policy_document?.data;
    if (policyDoc) {
      const policyNo =
        policyDoc.policy_no ?? policyDoc.policy_number ?? policyDoc.policyNo;
      if (policyNo) {
        setValue('policyNumber', String(policyNo), { shouldValidate: true });
        appliedFields++;
      }
    }

    if (appliedFields > 0) {
      toast({
        title: 'AI extraction applied',
        description: `${appliedFields} field${appliedFields > 1 ? 's' : ''} auto-filled. Review and adjust before submitting.`,
      });
    } else {
      toast({
        title: 'No fields extracted',
        description:
          'The OCR pipeline did not return any structured fields from these documents.',
        variant: 'destructive',
      });
    }
  };

  /**
   * One-click demo data — realistic Klang Valley flood claim. Useful for
   * insurer demos and QA without hand-typing 20+ fields.
   */
  const fillDemoData = () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400_000);
    const incidentStart = new Date(twoDaysAgo.getFullYear(), twoDaysAgo.getMonth(), twoDaysAgo.getDate(), 6, 30);
    const incidentEnd = new Date(now.getTime() - 12 * 3600_000);
    reset({
      claimantName: 'Siti Nurhaliza binti Rahman',
      claimantNric: '880214-10-5432',
      claimantPhone: '+60123456789',
      policyNumber: 'POL-FLD-2026-007821',
      incidentDate: now.toISOString().slice(0, 10),
      address: 'No. 12, Jalan Sri Muda 5, Taman Sri Muda, 40400 Shah Alam, Selangor',
      description:
        "Heavy monsoon rainfall caused Klang River to overflow into Taman Sri Muda overnight. Ground floor flooded to ~1.2m, damaging furniture, electrical appliances, and the family car parked outside.",
      incidentStart: incidentStart.toISOString().slice(0, 16),
      incidentEnd: incidentEnd.toISOString().slice(0, 16),
      waterDepthCm: 120,
      durationHours: 36,
      source: 'RIVER_OVERFLOW',
      propertyType: 'RESIDENTIAL',
      propertyFloorLevel: 0,
      propertyElevationMeters: 12.5,
      postcode: '40400',
      state: 'Selangor',
      buildingDamageRm: 35000,
      contentsDamageRm: 18000,
      vehicleDamageRm: 22000,
    });
    toast({
      title: 'Demo data filled',
      description: 'Sample flood claim populated. Review before submitting.',
    });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const claim = await createFlood.mutateAsync({
        // Claimant resolution happens at the api-gateway
        claimantNric: values.claimantNric,
        claimantPhone: values.claimantPhone,
        claimantName: values.claimantName,
        nric: values.claimantNric,
        policyNumber: values.policyNumber,
        incidentDate: new Date(values.incidentDate).toISOString(),
        incidentLocation: { address: values.address },
        description: values.description,
        isPdpaCompliant: true,
        // Flood sub-table
        incidentStart: new Date(values.incidentStart).toISOString(),
        incidentEnd: values.incidentEnd
          ? new Date(values.incidentEnd).toISOString()
          : undefined,
        waterDepthCm: values.waterDepthCm,
        durationHours: values.durationHours,
        source: values.source as any,
        propertyType: values.propertyType as any,
        propertyFloorLevel: values.propertyFloorLevel,
        propertyElevationMeters: values.propertyElevationMeters,
        postcode: values.postcode || undefined,
        state: values.state || undefined,
        buildingDamageRm: values.buildingDamageRm,
        contentsDamageRm: values.contentsDamageRm,
        vehicleDamageRm: values.vehicleDamageRm,
      });

      toast({
        title: 'Flood claim created',
        description: `${claim.claimNumber} submitted`,
      });
      navigate(`/claims/${claim.id}`);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Failed to create flood claim';
      toast({
        title: 'Submission failed',
        description: Array.isArray(msg) ? msg.join(', ') : msg,
        variant: 'destructive',
      });
    }
  };

  const sourceValue = watch('source');
  const propertyTypeValue = watch('propertyType');
  const stateValue = watch('state');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center flex-shrink-0">
            <Waves className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">New flood claim</h2>
            <p className="text-sm text-muted-foreground">
              Capture incident, property, and damage details. External verification
              (MetMalaysia rainfall, JPS gauges) runs automatically after submission.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fillDemoData}
          className="flex-shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Fill demo data
        </Button>
      </div>

      {/* AI document import — extracts NRIC name + policy number, optional */}
      <AiImportSection onExtracted={handleExtracted} />

      {/* Claimant + Policy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Claimant &amp; policy</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full name" error={errors.claimantName?.message}>
            <Input {...register('claimantName')} placeholder="As per NRIC" />
          </Field>
          <Field label="NRIC" error={errors.claimantNric?.message}>
            <Input {...register('claimantNric')} placeholder="850512-14-5567" />
          </Field>
          <Field label="Phone" error={errors.claimantPhone?.message}>
            <Input {...register('claimantPhone')} placeholder="+60123456789" />
          </Field>
          <Field label="Policy number" error={errors.policyNumber?.message}>
            <Input {...register('policyNumber')} placeholder="POL-FLD-2026-..." />
          </Field>
        </CardContent>
      </Card>

      {/* Incident */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incident</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Reported date" error={errors.incidentDate?.message}>
            <Input type="date" {...register('incidentDate')} />
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <Input
              {...register('address')}
              placeholder="Property address"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" error={errors.description?.message}>
              <Textarea
                {...register('description')}
                rows={3}
                placeholder="Brief narrative of what happened"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Flood specifics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Flood event</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Flood start (date &amp; time)"
            error={errors.incidentStart?.message}
          >
            <Input type="datetime-local" {...register('incidentStart')} />
          </Field>
          <Field
            label="Flood end (optional)"
            error={errors.incidentEnd?.message}
          >
            <Input type="datetime-local" {...register('incidentEnd')} />
          </Field>
          <Field
            label="Water depth (cm)"
            error={errors.waterDepthCm?.message}
          >
            <Input type="number" min={0} {...register('waterDepthCm')} placeholder="120" />
          </Field>
          <Field
            label="Duration (hours)"
            error={errors.durationHours?.message}
          >
            <Input
              type="number"
              min={0}
              {...register('durationHours')}
              placeholder="60"
            />
          </Field>
          <Field label="Source" error={errors.source?.message}>
            <Select
              value={sourceValue ?? ''}
              onValueChange={v => setValue('source', v as any)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {FLOOD_SOURCES.map(s => (
                  <SelectItem key={s} value={s}>
                    {titleCase(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Property type" error={errors.propertyType?.message}>
            <Select
              value={propertyTypeValue ?? ''}
              onValueChange={v => setValue('propertyType', v as any)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select property type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map(p => (
                  <SelectItem key={p} value={p}>
                    {titleCase(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Floor level (0 = ground)"
            error={errors.propertyFloorLevel?.message}
          >
            <Input
              type="number"
              {...register('propertyFloorLevel')}
              placeholder="0"
            />
          </Field>
          <Field
            label="Elevation (m above sea level)"
            error={errors.propertyElevationMeters?.message}
          >
            <Input
              type="number"
              step="0.1"
              {...register('propertyElevationMeters')}
              placeholder="12.5"
            />
          </Field>
          <Field label="Postcode" error={errors.postcode?.message}>
            <Input
              {...register('postcode')}
              placeholder="40400"
              maxLength={5}
            />
          </Field>
          <Field label="State" error={errors.state?.message}>
            <Select
              value={stateValue ?? ''}
              onValueChange={v => setValue('state', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {MALAYSIAN_STATES.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* Claimed damage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Claimed damage (RM)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Building" error={errors.buildingDamageRm?.message}>
            <Input
              type="number"
              min={0}
              {...register('buildingDamageRm')}
              placeholder="35000"
            />
          </Field>
          <Field label="Contents" error={errors.contentsDamageRm?.message}>
            <Input
              type="number"
              min={0}
              {...register('contentsDamageRm')}
              placeholder="18000"
            />
          </Field>
          <Field label="Vehicle" error={errors.vehicleDamageRm?.message}>
            <Input
              type="number"
              min={0}
              {...register('vehicleDamageRm')}
              placeholder="0"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit flood claim
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

function titleCase(s: string): string {
  return s
    .split('_')
    .map(w => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

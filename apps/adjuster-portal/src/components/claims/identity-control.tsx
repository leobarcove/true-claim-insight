import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useHasPermission, PERMISSIONS } from '@/lib/permissions';

/**
 * Record that a claimant's identity was established.
 *
 * Automated eKYC is not integrated, and a control nobody can satisfy is a
 * control that gets switched off. An operator examining the MyKad already on
 * file is a real basis — what makes it auditable is naming what was examined,
 * which the server insists on and records against whoever said it.
 *
 * Deliberately not a one-click "Verify" button. The basis is the whole point:
 * "VERIFIED" with nothing behind it is the false comfort §3.6 is about.
 */
export function IdentityControl({
  claimantId,
  kycStatus,
  onVerified,
}: {
  claimantId?: string;
  kycStatus?: string;
  onVerified?: () => void;
}) {
  const { toast } = useToast();
  const canVerify = useHasPermission(PERMISSIONS.CLAIMS_EDIT);
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState('');
  const [saving, setSaving] = useState(false);

  if (!claimantId || kycStatus === 'VERIFIED' || !canVerify) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/claimants/${claimantId}/identity`, {
        status: 'VERIFIED',
        basis: basis.trim(),
      });
      toast({ title: 'Identity recorded as verified' });
      setOpen(false);
      setBasis('');
      onVerified?.();
    } catch (error: any) {
      toast({
        title: 'Not recorded',
        description:
          error?.response?.data?.error?.message ?? error?.response?.data?.message ?? error?.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-2 h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        <ShieldCheck className="mr-1 h-3 w-3" />
        Verify identity
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Input
        autoFocus
        value={basis}
        placeholder="MyKad seen — last 4 digits, or the eKYC reference"
        onChange={event => setBasis(event.target.value)}
        className="h-8 text-xs"
      />
      <p className="text-[11px] text-muted-foreground">
        Recorded against your name. A claim cannot be reported on or decided until identity is
        established.
      </p>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={saving || !basis.trim()}>
          {saving ? 'Recording…' : 'Record'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            setOpen(false);
            setBasis('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

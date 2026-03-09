import { useState } from 'react';
import { useAuthStore, UserTenant } from '@/stores/auth-store';
import { useSwitchTenant } from '@/hooks/use-auth';
import { useTenants } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Check, Building2 } from 'lucide-react';

interface TenantSelectorProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function TenantSelector({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  showTrigger = true,
}: TenantSelectorProps) {
  const { user, userTenants } = useAuthStore();
  const switchTenantMutation = useSwitchTenant();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setInternalOpen;

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { data: tenantsData } = useTenants({ limit: 10 });
  const allTenants = tenantsData?.tenants || [];

  // For SUPER_ADMIN, create temporary UserTenant objects for each tenant to reuse the switcher logic
  const displayTenants: UserTenant[] =
    isSuperAdmin && allTenants.length > 0
      ? allTenants.map((t: any) => ({
          id: t.id,
          userId: user.id,
          tenantId: t.id,
          role: 'SUPER_ADMIN',
          isDefault: false,
          status: t.status,
          tenantName: t.name,
          tenantType: t.type,
        }))
      : userTenants;

  if (!user || (displayTenants.length <= 1 && !isSuperAdmin)) {
    return null;
  }

  const currentTenant = displayTenants.find(t => t.tenantId === user.currentTenantId);

  const handleSwitchTenant = async (tenant: UserTenant) => {
    if (tenant.tenantId === user.currentTenantId) {
      setOpen(false);
      return;
    }

    try {
      await switchTenantMutation.mutateAsync(tenant.tenantId);
      toast({
        title: 'Tenant switched',
        description: `Now viewing ${tenant.tenantName}`,
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Switch failed',
        description: 'Failed to switch tenant. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="flex w-full items-center gap-3 p-2 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-primary/30 hover:shadow-sm transition-all duration-300 text-left group active:scale-[0.98]">
            <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20 shadow-sm group-hover:bg-primary/20 transition-colors">
              <Building2 className="h-3 w-3 text-primary" />
            </div>
            <div className="min-w-0 flex flex-col justify-center leading-[14px]">
              <p className="text-[10px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {currentTenant?.tenantName || 'Select Tenant'}
              </p>
              <p className="text-[9px] text-muted-foreground truncate opacity-70">
                Click to switch
              </p>
            </div>
          </button>
        </DialogTrigger>
      )}
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl rounded-[2rem]"
        onPointerDownOutside={e => {
          // Prevent closing if selection is required
          const isSelectionRequired = isSuperAdmin && !user.currentTenantId;
          if (isSelectionRequired) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={e => {
          // Prevent closing if selection is required
          const isSelectionRequired = isSuperAdmin && !user.currentTenantId;
          if (isSelectionRequired) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            {isSuperAdmin && !user.currentTenantId ? 'Select Tenant' : 'Switch Tenant'}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground/80 leading-relaxed">
            {isSuperAdmin && !user.currentTenantId
              ? 'Please select a tenant to begin viewing data. You can switch tenants anytime later.'
              : 'Select the organization context you would like to switch to. Your current session data will be updated accordingly.'}
          </DialogDescription>
        </DialogHeader>
        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-sidebar">
          {displayTenants.map(tenant => {
            const isActive = tenant.tenantId === user.currentTenantId;
            return (
              <button
                key={tenant.tenantId}
                onClick={() => handleSwitchTenant(tenant)}
                disabled={switchTenantMutation.isPending}
                className={cn(
                  'flex w-full items-center gap-3 p-4 rounded-2xl border transition-all duration-300 text-left group relative overflow-hidden disabled:opacity-50',
                  isActive
                    ? 'bg-primary/5 border-primary/20 shadow-sm'
                    : 'hover:bg-muted/80 border-border/60 active:scale-[0.99]'
                )}
              >
                {isActive && <div className="absolute inset-y-0 left-0 w-1 bg-primary" />}
                <div
                  className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all duration-300',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                      : 'bg-primary/10 text-primary border-primary/20 group-hover:bg-primary/20'
                  )}
                >
                  <span className="text-sm font-bold">
                    {tenant.tenantName.substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p
                    className={cn(
                      'font-bold transition-colors',
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    {tenant.tenantName}
                  </p>
                  <p className="text-sm text-muted-foreground/70 truncate capitalize font-medium">
                    {tenant.role.toLowerCase().replace('_', ' ')}
                  </p>
                </div>
                {isActive && (
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="p-4 bg-muted/30 border-t border-border/50">
          <p className="text-[10px] text-center text-muted-foreground font-medium uppercase tracking-widest">
            {displayTenants.length} Tenants Available {isSuperAdmin ? '(Super Admin)' : ''}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

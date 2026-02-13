import { Building2, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, UserTenant } from '@/stores/auth-store';
import { useSwitchTenant } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function TenantSwitcher() {
  const { user, userTenants } = useAuthStore();
  const switchTenantMutation = useSwitchTenant();
  const { toast } = useToast();

  if (!user || userTenants.length === 0) {
    return null;
  }

  const handleSwitchTenant = async (tenant: UserTenant) => {
    if (tenant.tenantId === user.currentTenantId) {
      return;
    }

    try {
      await switchTenantMutation.mutateAsync(tenant.tenantId);
      toast({
        title: 'Tenant switched',
        description: `Now viewing ${tenant.tenantName}`,
      });
    } catch (error) {
      toast({
        title: 'Switch failed',
        description: 'Failed to switch tenant. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-1.5">
      {userTenants.map(tenant => {
        const isActive = tenant.tenantId === user.currentTenantId;
        return (
          <button
            key={tenant.tenantId}
            onClick={() => handleSwitchTenant(tenant)}
            disabled={switchTenantMutation.isPending}
            className={cn(
              'flex w-full items-center gap-3 p-1 px-1.5 rounded-xl border transition-all duration-200 text-left group',
              isActive
                ? 'bg-primary/5 border-primary/20 shadow-sm'
                : 'hover:bg-accent border-transparent hover:border-border text-foreground'
            )}
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border-2 border-background shadow-sm overflow-hidden ring-1 ring-primary/5">
              <span className="text-xs font-bold text-primary">
                {tenant.tenantName.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold truncate group-hover:text-primary transition-colors">
                {tenant.tenantName}
              </p>
              <p className="text-[10px] text-muted-foreground truncate opacity-80 capitalize">
                {tenant.role.toLowerCase().replace('_', ' ')}
              </p>
            </div>
            <div
              className={cn(
                'h-3 w-3 rounded-full border-2 flex items-center justify-center transition-all duration-300',
                isActive
                  ? 'border-primary bg-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]'
                  : 'border-muted-foreground/30 group-hover:border-primary/50'
              )}
            >
              {isActive && <div className="h-1 w-1 rounded-full bg-primary-foreground" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

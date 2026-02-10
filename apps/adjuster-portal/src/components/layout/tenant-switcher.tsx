import { Building2, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, UserTenant } from '@/stores/auth-store';
import { useSwitchTenant } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function TenantSwitcher() {
  const { user, userTenants } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const switchTenantMutation = useSwitchTenant();
  const { toast } = useToast();

  if (!user || userTenants.length <= 1) {
    return null; // Don't show switcher if user has only one tenant
  }

  const currentTenant =
    userTenants.find(t => t.tenantId === user.currentTenantId) || userTenants[0];

  const handleSwitchTenant = async (tenant: UserTenant) => {
    if (tenant.tenantId === user.currentTenantId) {
      setIsOpen(false);
      return;
    }

    try {
      await switchTenantMutation.mutateAsync(tenant.tenantId);
      toast({
        title: 'Tenant switched',
        description: `Now viewing ${tenant.tenantName}`,
      });
      setIsOpen(false);
    } catch (error) {
      toast({
        title: 'Switch failed',
        description: 'Failed to switch tenant. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-accent transition-all duration-200 text-left"
      >
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {currentTenant.tenantName}
          </p>
          <p className="text-[10px] text-muted-foreground truncate capitalize">
            {currentTenant.tenantType.toLowerCase().replace('_', ' ')}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-2 z-20 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
              {userTenants.map(tenant => (
                <button
                  key={tenant.tenantId}
                  onClick={() => handleSwitchTenant(tenant)}
                  disabled={switchTenantMutation.isPending}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                    tenant.tenantId === user.currentTenantId
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent text-foreground',
                    switchTenantMutation.isPending && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tenant.tenantName}</p>
                    <p className="text-xs text-muted-foreground truncate capitalize">
                      {tenant.role.toLowerCase().replace('_', ' ')}
                    </p>
                  </div>
                  {tenant.tenantId === user.currentTenantId && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                  {tenant.isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex-shrink-0">
                      Default
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { Building2, Check, Crown, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSwitchTenant } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function TenantMemberships() {
  const { user, userTenants } = useAuthStore();
  const switchTenantMutation = useSwitchTenant();
  const { toast } = useToast();

  if (!user || userTenants.length === 0) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Tenant Memberships</CardTitle>
          <CardDescription>
            You are not currently associated with any tenants.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleSetActive = async (tenantId: string) => {
    if (tenantId === user.currentTenantId) return;

    try {
      await switchTenantMutation.mutateAsync(tenantId);
      toast({
        title: 'Active tenant changed',
        description: 'Your active tenant has been updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Failed to switch tenant',
        description: 'There was an error changing your active tenant.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Tenant Memberships</CardTitle>
        <CardDescription>
          Organizations you belong to and your role in each.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {userTenants.map(tenant => {
            const isActive = tenant.tenantId === user.currentTenantId;
            const isDefault = tenant.isDefault;

            return (
              <div
                key={tenant.tenantId}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border transition-all',
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-border'
                )}
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm truncate">
                      {tenant.tenantName}
                    </h3>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    )}
                    {isDefault && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Crown className="h-3 w-3" />
                        Default
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {tenant.role.replace(/_/g, ' ')}
                    </span>
                    <span className="capitalize">
                      {tenant.tenantType.toLowerCase().replace('_', ' ')}
                    </span>
                    <Badge
                      variant={tenant.status === 'ACTIVE' ? 'success' : 'secondary'}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {tenant.status}
                    </Badge>
                  </div>

                  {tenant.lastAccessedAt && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Last accessed: {new Date(tenant.lastAccessedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isActive ? (
                    <div className="flex items-center gap-1 text-primary text-sm font-medium px-3 py-1.5 rounded-lg bg-primary/10">
                      <Check className="h-4 w-4" />
                      Active
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetActive(tenant.tenantId)}
                      disabled={switchTenantMutation.isPending || tenant.status !== 'ACTIVE'}
                    >
                      Set Active
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {userTenants.length > 1 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <p className="font-medium mb-1">💡 Tip:</p>
            <p>
              You can quickly switch between tenants using the tenant switcher in the sidebar.
              Your active tenant determines which data you see and can access.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

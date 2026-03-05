import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Video,
  Calendar,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  Monitor,
  ChevronsUpDown,
  Factory,
  Car,
  Building2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/hooks/use-auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InfoTooltip } from '@/components/ui/tooltip';
import { TenantSelector } from './tenant-selector';
import { useSuperAdminNoTenant } from '@/hooks/use-super-admin-no-tenant';
import { PERMISSIONS, ROLE_PERMISSIONS, useHasAnyPermission } from '@/lib/permissions';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  permissions?: string[];
  roles?: string[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    name: 'Claims',
    href: '/claims',
    icon: FileText,
    permissions: [
      PERMISSIONS.CLAIMS_VIEW_OWN,
      PERMISSIONS.CLAIMS_VIEW_BASIC,
      PERMISSIONS.CLAIMS_VIEW_ALL,
    ],
  },
  {
    name: 'Sessions',
    href: '/sessions',
    icon: Video,
    permissions: [PERMISSIONS.VIDEO_CONDUCT, PERMISSIONS.VIDEO_VIEW_RECORDINGS],
  },
  {
    name: 'Schedule',
    href: '/schedule',
    icon: Calendar,
    roles: ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN', 'SIU_INVESTIGATOR'],
  },
  {
    name: 'Documents',
    href: '/documents',
    icon: FileText,
    permissions: [
      PERMISSIONS.CLAIMS_VIEW_OWN,
      PERMISSIONS.CLAIMS_VIEW_BASIC,
      PERMISSIONS.CLAIMS_VIEW_ALL,
    ],
  },
];

const masterDataNavigation: NavItem[] = [
  {
    name: 'Vehicle Make',
    href: '/master-data/vehicle-make',
    icon: Factory,
    roles: ['FIRM_ADMIN', 'SUPER_ADMIN'],
  },
  {
    name: 'Vehicle Model',
    href: '/master-data/vehicle-model',
    icon: Car,
    roles: ['FIRM_ADMIN', 'SUPER_ADMIN'],
  },
];

const secondaryNavigation: NavItem[] = [
  {
    name: 'Tenants',
    href: '/tenants',
    icon: Building2,
    roles: ['SUPER_ADMIN'],
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN', 'SIU_INVESTIGATOR', 'COMPLIANCE_OFFICER'],
  },
  { name: 'Help', href: '/help', icon: HelpCircle },
];

interface SidebarProps {
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  isMobile: boolean;
}

export function Sidebar({ isCollapsed, onCollapseChange, isMobile }: SidebarProps) {
  const location = useLocation();
  const { user, userTenants } = useAuthStore();
  const logoutMutation = useLogout();
  const { theme, setTheme } = useTheme();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const { isSelectionRequired } = useSuperAdminNoTenant();
  const setIsCollapsed = (collapsed: boolean) => {
    onCollapseChange(collapsed);
  };

  React.useEffect(() => {
    if (isMobile && !isCollapsed) {
      setIsCollapsed(true);
    }
  }, [location.pathname, isMobile]);

  const handleLogoutClick = () => {
    setIsLogoutDialogOpen(true);
  };

  const handleConfirmLogout = () => {
    logoutMutation.mutate();
    setIsLogoutDialogOpen(false);
  };

  const isAwaitingActivation = userTenants.length === 0 && user?.role !== 'SUPER_ADMIN';

  const filterNavItems = (
    items: NavItem[],
    section: 'general' | 'master' | 'support' = 'general'
  ) => {
    return items.filter(item => {
      if (isAwaitingActivation && (section === 'general' || section === 'master')) {
        if (item.href === '/') return true;
        return false;
      }

      // Role check
      if (item.roles && (!user || !item.roles.includes(user.role))) {
        return false;
      }
      // Permission check
      if (item.permissions && item.permissions.length > 0) {
        const userPerms = user ? (ROLE_PERMISSIONS as any)[user.role] : [];
        const hasPermission = item.permissions.some(p => userPerms?.includes(p));
        if (!hasPermission) return false;
      }
      return true;
    });
  };

  const visibleGeneral = filterNavItems(navigation, 'general');
  const visibleMasterData = filterNavItems(masterDataNavigation, 'master');
  const visibleSecondary = filterNavItems(secondaryNavigation, 'support');

  return (
    <>
      {/* Backdrop for mobile expanded view */}
      {isMobile && !isCollapsed && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[45] transition-all duration-300"
          onClick={() => setIsCollapsed(true)}
        />
      )}
      <div
        className={cn(
          'flex h-full flex-col border-r border-border shadow-sm bg-card transition-all duration-300 relative',
          isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative',
          isCollapsed ? 'w-20' : 'w-60'
        )}
      >
        {/* Header / Logo */}
        <div className="h-20 flex items-center justify-center px-4 transition-all duration-300">
          <Link to="/" className="flex items-center justify-center transition-all duration-300">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-8 w-8 rounded-lg object-contain flex-shrink-0"
            />
            <span
              className={cn(
                'font-bold text-xl tracking-tight text-foreground transition-all duration-300 whitespace-nowrap overflow-hidden',
                isCollapsed ? 'w-0 opacity-0 ml-0' : 'w-auto opacity-100 ml-2'
              )}
            >
              True Claim
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto pt-2 pb-6 px-4 space-y-8 scrollbar-sidebar">
          {/* General Section */}
          {visibleGeneral.length > 0 && (
            <div>
              {!isCollapsed && (
                <h3 className="mb-2 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                  General
                </h3>
              )}
              <div className="space-y-1">
                {visibleGeneral.map(item => {
                  const isActive =
                    item.href === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.href);
                  return (
                    <InfoTooltip
                      key={item.name}
                      content={item.name}
                      direction="right"
                      display="block"
                      fontSize="text-[12px]"
                      disabled={!isCollapsed}
                      trigger={
                        <Link
                          to={item.href}
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            isCollapsed && 'justify-center px-0 h-10 w-10 mx-auto'
                          )}
                        >
                          <item.icon
                            className={cn(
                              'h-4 w-4 transition-colors',
                              isActive
                                ? 'text-primary-foreground'
                                : 'text-muted-foreground group-hover:text-current'
                            )}
                          />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Master Data Section */}
          {visibleMasterData.length > 0 && (
            <div>
              {isCollapsed ? (
                <div className="-mt-6 mb-1 border-t-[1.5px] border-border rounded-xl" />
              ) : (
                <h3 className="mb-2 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                  Master Data
                </h3>
              )}
              <div className="space-y-1">
                {visibleMasterData.map(item => {
                  const isActive = location.pathname === item.href;
                  return (
                    <InfoTooltip
                      key={item.name}
                      content={item.name}
                      direction="right"
                      display="block"
                      fontSize="text-[12px]"
                      disabled={!isCollapsed}
                      trigger={
                        <Link
                          to={item.href}
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            isCollapsed && 'justify-center px-0 h-10 w-10 mx-auto'
                          )}
                        >
                          <item.icon
                            className={cn(
                              'h-4 w-4 transition-colors',
                              isActive
                                ? 'text-primary-foreground'
                                : 'text-muted-foreground group-hover:text-current'
                            )}
                          />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Support Section */}
          {visibleSecondary.length > 0 && (
            <div>
              {isCollapsed ? (
                <div className="-mt-6 mb-1 border-t-[1.5px] border-border rounded-xl" />
              ) : (
                <h3 className="mb-2 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                  Support
                </h3>
              )}
              <div className="space-y-1">
                {visibleSecondary.map(item => {
                  const isActive = location.pathname === item.href;
                  return (
                    <InfoTooltip
                      key={item.name}
                      content={item.name}
                      direction="right"
                      display="block"
                      fontSize="text-[12px]"
                      disabled={!isCollapsed}
                      trigger={
                        <Link
                          to={item.href}
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            isCollapsed && 'justify-center px-0 h-10 w-10 mx-auto'
                          )}
                        >
                          <item.icon
                            className={cn(
                              'h-4 w-4 transition-colors',
                              isActive
                                ? 'text-primary-foreground'
                                : 'text-muted-foreground group-hover:text-current'
                            )}
                          />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
                          {!isCollapsed && item.name === 'Help' && (
                            <span className="ml-auto rounded-full bg-emerald-100 text-emerald-600 px-2 py-0.5 text-[10px] font-bold">
                              24/7
                            </span>
                          )}
                        </Link>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="mt-auto px-4 py-6">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center gap-3 p-3 rounded-xl border border-border/50 bg-card transition-all duration-300 shadow-sm hover:shadow-xl group text-left outline-none',
                  isCollapsed &&
                    'justify-center p-0 border-none bg-transparent shadow-none hover:shadow-none'
                )}
              >
                <div className="relative">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-md bg-muted ring-2 ring-primary/5 group-hover:ring-primary/20 transition-all duration-300">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                      {user ? getInitials(user.fullName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {user?.fullName || 'Guest User'}
                      </p>
                      <p className="text-[9px] text-muted-foreground truncate opacity-80">
                        {user?.tenantName || 'No Tenant'}
                      </p>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-all duration-300" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className={cn(
                'p-0 mb-1 overflow-hidden rounded-3xl border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl transition-all duration-300',
                isCollapsed ? 'w-60 ml-4' : 'w-[var(--radix-popover-trigger-width)]'
              )}
              align="start"
              side={isCollapsed ? 'right' : 'top'}
              sideOffset={12}
            >
              <div className="p-3 space-y-3">
                {/* Profile Header */}
                <div className="flex items-center gap-3 px-1">
                  <div className="relative">
                    <Avatar className="h-10 w-10 border-2 border-background shadow-sm bg-muted ring-1 ring-primary/10">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                        {user ? getInitials(user.fullName) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="min-w-0 flex flex-col justify-center leading-[14px]">
                    <p className="text-[11px] font-bold text-foreground truncate">
                      {user?.fullName || 'Guest User'}
                    </p>
                    <p className="text-[9px] text-muted-foreground truncate opacity-80">
                      {user?.email || 'guest@example.com'}
                    </p>
                  </div>
                </div>

                {/* Theme Switcher Row */}
                <div className="relative flex items-center justify-between bg-muted/40 border border-border/40 rounded-3xl overflow-hidden p-1">
                  {/* Sliding Indicator */}
                  <div
                    className={cn(
                      'absolute inset-y-1 transition-all duration-300 ease-out bg-primary/80 rounded-2xl z-0 shadow-sm',
                      theme === 'light' && 'left-1 w-[calc(33.33%-4px)]',
                      theme === 'dark' && 'left-[calc(33.33%+2px)] w-[calc(33.33%-4px)]',
                      theme === 'system' && 'left-[calc(66.66%)] w-[calc(33.33%-4px)]'
                    )}
                  />
                  {[
                    { id: 'light', icon: Sun, label: 'Light' },
                    { id: 'dark', icon: Moon, label: 'Dark' },
                    { id: 'system', icon: Monitor, label: 'System' },
                  ].map(item => (
                    <InfoTooltip
                      key={item.id}
                      content={item.label}
                      direction="top"
                      fontSize="text-[11px]"
                      className="flex-1"
                      trigger={
                        <button
                          onClick={() => setTheme(item.id as any)}
                          className={cn(
                            'relative z-10 flex w-full items-center justify-center gap-1.5 p-1 rounded-2xl transition-colors duration-300',
                            theme === item.id
                              ? 'text-primary-foreground'
                              : 'text-muted-foreground hover:text-primary'
                          )}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                        </button>
                      }
                    />
                  ))}
                </div>

                {/* Switch Tenant Section – shown when multiple tenants OR super admin */}
                {(userTenants.length > 1 || user?.role === 'SUPER_ADMIN') && (
                  <>
                    <div className="space-y-1.5 pt-1 border-t border-border/50">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] px-1">
                        Switch Tenant
                      </p>
                      <TenantSelector />
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
                  </>
                )}

                {userTenants.length <= 1 && user?.role !== 'SUPER_ADMIN' && (
                  <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
                )}
              </div>

              {/* Logout Button */}
              <div className="p-3 pt-0">
                <Button
                  variant="destructive"
                  onClick={handleLogoutClick}
                  className="w-full h-9 rounded-xl shadow-lg shadow-destructive/20 text-sm font-bold transition-all duration-300 active:scale-[0.98] gap-2.5"
                >
                  Logout
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Sidebar Toggle Button */}
        <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-50">
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 rounded-xl"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ConfirmationDialog
          open={isLogoutDialogOpen}
          onOpenChange={setIsLogoutDialogOpen}
          title="Confirm Logout"
          description="Are you sure you want to log out of your session?"
          onConfirm={handleConfirmLogout}
          confirmText="Logout"
          variant="destructive"
          isLoading={logoutMutation.isPending}
        />

        {/* Hidden TenantSelector that is forced open for SuperAdmins with no tenant */}
        <TenantSelector open={isSelectionRequired} showTrigger={false} />
      </div>
    </>
  );
}

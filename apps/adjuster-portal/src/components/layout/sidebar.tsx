import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Video,
  Calendar,
  Settings,
  HelpCircle,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronsUpDown,
  Factory,
  Car,
  Plus,
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
import { TenantSwitcher } from './tenant-switcher';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Claims', href: '/claims', icon: FileText },
  { name: 'Sessions', href: '/sessions', icon: Video },
  { name: 'Schedule', href: '/schedule', icon: Calendar },
  { name: 'Documents', href: '/documents', icon: FileText },
];

const masterDataNavigation = [
  { name: 'Vehicle Make', href: '/master-data/vehicle-make', icon: Factory },
  { name: 'Vehicle Model', href: '/master-data/vehicle-model', icon: Car },
];

const secondaryNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Help', href: '/help', icon: HelpCircle },
];

export function Sidebar() {
  const location = useLocation();
  const { user } = useAuthStore();
  const logoutMutation = useLogout();
  const { theme, setTheme } = useTheme();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  const handleLogoutClick = () => {
    setIsLogoutDialogOpen(true);
  };

  const handleConfirmLogout = () => {
    logoutMutation.mutate();
    setIsLogoutDialogOpen(false);
  };

  return (
    <div
      className="flex h-full w-60 flex-col border-r border-border shadow-sm bg-card transition-all"
      style={{ transitionDuration: '50ms' }}
    >
      {/* Header / Logo */}
      <div className="flex h-20 items-center justify-center px-4 -ml-2">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-bold text-xl tracking-tight text-foreground">True Claim</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 scrollbar-sidebar">
        {/* General Section */}
        <div>
          <h3 className="mb-2 px-2 text-xs font-bold text-muted-foreground uppercase">General</h3>
          <div className="space-y-1">
            {navigation.map(item => {
              const isActive =
                item.href === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Master Data Section */}
        <div>
          <h3 className="mb-2 px-2 text-xs font-bold text-muted-foreground uppercase">
            Master Data
          </h3>
          <div className="space-y-1">
            {masterDataNavigation.map(item => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Support Section */}
        <div>
          <h3 className="mb-2 px-2 text-xs font-bold text-muted-foreground uppercase">Support</h3>
          <div className="space-y-1">
            {secondaryNavigation.map(item => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
                  {item.name}
                  {item.name === 'Help' && (
                    <span className="ml-auto rounded-full bg-emerald-100 text-emerald-600 px-2 py-0.5 text-[10px] font-bold">
                      24/7
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="mt-auto px-4 py-6">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-3 p-3 rounded-xl border border-border/50 bg-card transition-all duration-300 shadow-sm hover:shadow-xl group text-left outline-none">
              <div className="relative">
                <Avatar className="h-10 w-10 border-2 border-background shadow-md bg-muted ring-2 ring-primary/5 group-hover:ring-primary/20 transition-all duration-300">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                    {user ? getInitials(user.fullName) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {user?.fullName || 'Guest User'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate opacity-80 font-medium">
                  {user?.email || 'guest@example.com'}
                </p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-all duration-300" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0 mb-1 overflow-hidden rounded-3xl border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl"
            align="start"
            side="top"
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
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-foreground truncate">
                    {user?.fullName || 'Guest User'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate opacity-80">
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
                    theme === 'system' && 'left-[calc(66.66%+3px)] w-[calc(33.33%-4px)]'
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

              <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

              {/* Switch Account Section */}
              <div className="space-y-1 pt-2 border-t border-border/50">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] px-4">
                  Switch Account
                </p>
                <div className="px-1 space-y-1">
                  <TenantSwitcher />
                  <button className="flex w-full items-center gap-3 p-1 px-1.5 rounded-xl border border-transparent hover:bg-accent hover:border-border transition-all duration-200 text-left group">
                    <div className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all">
                      <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                        Add account
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
            </div>

            {/* Logout Button */}
            <div className="p-3 pt-0">
              <Button
                variant="destructive"
                onClick={handleLogoutClick}
                className="w-full h-9 rounded-xl shadow-lg shadow-destructive/20 text-sm font-bold transition-all duration-300 active:scale-[0.98] gap-2.5"
              >
                Logout
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
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
    </div>
  );
}

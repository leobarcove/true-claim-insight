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
  ChevronLeft,
  ChevronUp,
  Factory,
  Car,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/hooks/use-auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/hooks/use-theme';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
              <Avatar className="h-10 w-10 border-2 border-background shadow-md bg-muted ring-2 ring-primary/5 group-hover:ring-primary/20 transition-all duration-300">
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {user ? getInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {user?.fullName || 'Guest User'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate opacity-80">
                  {user?.email || 'guest@example.com'}
                </p>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-all duration-300" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-2 mb-1"
            align="start"
            side="top"
            sideOffset={8}
          >
            <div className="space-y-1">
              <div className="px-1">
                <Button
                  variant="ghost"
                  className="w-full justify-between h-10 px-3 text-muted-foreground hover:text-accent-foreground/80 hover:bg-accent/50 rounded-lg group"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  <span className="text-sm font-medium">Dark Mode</span>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
                    className="data-[state=checked]:bg-primary scale-90 pointer-events-none"
                  />
                </Button>

                <Button
                  variant="ghost"
                  className="w-full justify-between h-10 px-3 text-muted-foreground hover:text-accent-foreground/80 hover:bg-accent/50 rounded-lg group"
                  onClick={handleLogoutClick}
                >
                  <span className="text-sm font-medium">Logout</span>
                  <LogOut className="h-4 w-4 transition-colors" />
                </Button>
              </div>
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

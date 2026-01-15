import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Video,
  Calendar,
  Settings,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/hooks/use-auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/hooks/use-theme';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Claims', href: '/claims', icon: FileText },
  { name: 'Video Sessions', href: '/sessions', icon: Video },
  { name: 'Schedule', href: '/schedule', icon: Calendar },
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

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex h-full w-60 flex-col border-r border-border/50 bg-card transition-all duration-300">
      {/* Header / Logo */}
      <div className="flex h-20 items-center justify-center px-4">
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
      <div className="mt-auto px-4 pb-5 space-y-6">
        {/* Toggles */}
        <div className="space-y-4">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-4">
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span>Dark Mode</span>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-3 pt-5 border-t border-border/50">
          <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {user ? getInitials(user.fullName) : 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {user?.fullName || 'Guest User'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {user?.email || 'guest@example.com'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-8 w-8 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

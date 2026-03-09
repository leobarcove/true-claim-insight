import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLayout } from './app-layout';

interface HeaderProps {
  title: string | React.ReactNode;
  description?: string | React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Header({ title, description, children, className }: HeaderProps) {
  const { currentWidth } = useLayout();

  return (
    <header
      className={cn('flex h-20 items-center justify-between border-b bg-card px-6', className)}
    >
      <div>
        <h1 className="text-lg sm:text-xl font-semibold">{title}</h1>
        {currentWidth > 430 && description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {children}

        {/* Notifications */}
        {/* <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
            1
          </span>
        </Button> */}
      </div>
    </header>
  );
}

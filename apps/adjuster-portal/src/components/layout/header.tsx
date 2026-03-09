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

      <div className="flex items-center gap-4">{children}</div>
    </header>
  );
}

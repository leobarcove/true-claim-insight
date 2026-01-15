import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onSearch, onChange, ...props }, ref) => {
    const [modifier, setModifier] = React.useState<string>('Ctrl');
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current!);

    React.useEffect(() => {
      if (typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
        setModifier('⌘');
      } else {
        setModifier('Ctrl');
      }
    }, []);

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
      <div className="relative flex items-center w-full max-w-xs md:max-w-sm">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pl-9 pr-14 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          onChange={e => {
            onChange?.(e);
            onSearch?.(e.target.value);
          }}
          {...props}
        />
        <div className="absolute right-3 flex items-center pointer-events-none select-none">
          <kbd className="inline-flex h-5 items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">{modifier} + F</span>
          </kbd>
        </div>
      </div>
    );
  }
);
SearchInput.displayName = 'SearchInput';

export { SearchInput };

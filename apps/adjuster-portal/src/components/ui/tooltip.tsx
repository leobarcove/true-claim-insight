import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TooltipDirection = 'top' | 'bottom' | 'left' | 'right';

interface InfoTooltipProps {
  title?: string;
  content: React.ReactNode;
  direction?: TooltipDirection;
  className?: string;
  contentClassName?: string;
  trigger?: React.ReactNode;
  variant?: 'light' | 'dark';
  iconSize?: number;
  fontSize?: string;
}

/**
 * A reusable Tooltip component that shows information on hover.
 * Uses React Portal to avoid being clipped by parent overflow: hidden/auto.
 */
export function InfoTooltip({
  title,
  content,
  direction = 'left',
  className,
  contentClassName,
  trigger,
  variant = 'dark',
  iconSize = 3,
  fontSize = 'text-[10px]',
}: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;

      const offset = 8;

      switch (direction) {
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - offset;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + offset;
          break;
        case 'top':
          top = rect.top - offset;
          left = rect.left + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + offset;
          left = rect.left + rect.width / 2;
          break;
      }

      setCoords({ top, left });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible]);

  const getTransform = () => {
    switch (direction) {
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
    }
  };

  const variantClasses = 'text-popover-foreground bg-popover border-border shadow-xl';
  const titleClasses = 'text-foreground';
  const contentClasses = 'text-muted-foreground';

  return (
    <div
      className={cn('inline-flex items-center', className)}
      ref={triggerRef}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {trigger || (
        <HelpCircle
          className={cn('text-muted-foreground cursor-help', `h-${iconSize} w-${iconSize}`)}
        />
      )}

      {isVisible &&
        createPortal(
          <div
            className={cn(
              'fixed z-[9999] p-3 leading-relaxed border rounded-md shadow-2xl whitespace-normal break-words pointer-events-none max-w-[350px]',
              fontSize,
              variantClasses,
              contentClassName
            )}
            style={{
              top: coords.top,
              left: coords.left,
              transform: getTransform(),
            }}
          >
            {title && <p className={cn('font-semibold mb-1', titleClasses)}>{title}</p>}
            <div className={contentClasses}>{content}</div>
          </div>,
          document.body
        )}
    </div>
  );
}

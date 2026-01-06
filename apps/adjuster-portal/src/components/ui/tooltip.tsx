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
  trigger?: React.ReactNode;
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
  trigger,
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

  // Adjust for 'right' and other tweaks

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

  return (
    <div
      className={cn('inline-flex items-center', className)}
      ref={triggerRef}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {trigger || <HelpCircle className="h-3 w-3 text-slate-500 cursor-help" />}

      {isVisible &&
        createPortal(
          <div
            className={cn(
              'fixed z-[9999] w-64 p-3 text-[10px] leading-relaxed text-slate-200 bg-slate-900 border border-slate-700 rounded-md shadow-2xl whitespace-normal pointer-events-none'
            )}
            style={{
              top: coords.top,
              left: coords.left,
              transform: getTransform(),
            }}
          >
            {title && <p className="font-semibold mb-1 text-slate-100">{title}</p>}
            <div className="text-slate-300">{content}</div>
          </div>,
          document.body
        )}
    </div>
  );
}

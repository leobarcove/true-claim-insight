import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { cn } from '@/lib/utils';

export interface LayoutContextType {
  isMobile: boolean;
  isCollapsed: boolean;
  currentWidth: number;
}

const breakpoint = {
  mobile: 768,
  tablet: 1024,
};
const currentBreakpoint = breakpoint.tablet;

const LayoutContext = React.createContext<LayoutContextType | undefined>(undefined);

export function useLayout() {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}

export function AppLayout() {
  const [currentWidth, setCurrentWidth] = useState(window.innerWidth);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= currentBreakpoint);
  const [isCollapsed, setIsCollapsed] = useState(window.innerWidth <= currentBreakpoint);

  useEffect(() => {
    let lastWidth = window.innerWidth;
    const handleResize = () => {
      const width = window.innerWidth;
      const isNowMobile = width <= currentBreakpoint;
      const wasDesktop = lastWidth > currentBreakpoint;

      setIsMobile(isNowMobile);
      if (isNowMobile && wasDesktop) {
        setIsCollapsed(true);
      } else if (!isNowMobile && !wasDesktop) {
        setIsCollapsed(false);
      }
      lastWidth = width;
      setCurrentWidth(width);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <LayoutContext.Provider value={{ isMobile, isCollapsed, currentWidth }}>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar isCollapsed={isCollapsed} onCollapseChange={setIsCollapsed} isMobile={isMobile} />
        <main
          className={cn(
            'flex-1 overflow-auto transition-all duration-300',
            isMobile ? 'ml-20' : ''
          )}
        >
          <Outlet />
        </main>
      </div>
    </LayoutContext.Provider>
  );
}

import React, { useState, useCallback } from 'react';
import { Home, Music, LayoutDashboard, LogOut, User, ChevronLeft, ChevronRight, Menu, X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onAuthClick: () => void;
  /**
   * Notifies the parent layout when the desktop sidebar is
   * collapsed/expanded so the main content margin can resize
   * (256px → 80px) instead of leaving a 176px dead gap.
   */
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'create', label: 'Create Music', icon: Music },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onAuthClick, onCollapsedChange }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Effective collapsed = the collapse toggle on desktop. Mobile is
  // never "collapsed" in this sense — it's an off-canvas drawer.
  React.useEffect(() => {
    onCollapsedChange?.(!isMobile && isCollapsed);
  }, [isCollapsed, isMobile, onCollapsedChange]);

  const handleNavigate = useCallback((page: string) => {
    onNavigate(page);
    if (isMobile) setIsMobileOpen(false);
  }, [onNavigate, isMobile]);

  const showLabels = !isCollapsed || isMobile;

  const MobileMenuButton = () => (
    <button onClick={() => setIsMobileOpen(true)} className="fixed top-[env(safe-area-inset-top,16px)] left-4 z-40 p-3 mt-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 lg:hidden shadow-2xl">
      <Menu className="w-5 h-5 text-white" />
    </button>
  );

  const sidebarContent = (
    <aside
      style={{ position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, bottom: 0 }}
      className={cn(
        // Sidebar is anchored to the viewport (position: fixed, inset-y-0)
        // and clips its own content (overflow-hidden). Page scroll never
        // moves it. The profile section is absolutely pinned to the bottom
        // so it is always visible in the first viewport.
        "h-screen bg-black/40 backdrop-blur-3xl border-r border-white/10 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.5)] overflow-hidden",
        isMobile ? "w-72 transition-transform duration-300 ease-out" : cn(isCollapsed ? "w-20" : "w-64", "transition-all duration-300 ease-in-out"),
        isMobile && !isMobileOpen && "-translate-x-full",
        isMobile && isMobileOpen && "translate-x-0",
      )}
    >
      {isMobile && (
        <button onClick={() => setIsMobileOpen(false)} className="absolute top-6 right-6 p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="p-6 pb-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary),0.3)] shrink-0">
            <Music className="w-6 h-6 text-black font-bold" />
          </div>
          {showLabels && (
            <div className="overflow-hidden">
              <h1 className="font-display font-bold text-xl text-white tracking-tight -mb-1">MuseVibe</h1>
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-primary/80">Creator Studio</span>
            </div>
          )}
        </div>
      </div>

      {!isMobile && (
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="absolute -right-3 top-24 w-6 h-6 rounded-full bg-primary border border-white/20 flex items-center justify-center hover:scale-110 transition-all shadow-[0_0_15px_rgba(var(--primary),0.5)]"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3 text-black" /> : <ChevronLeft className="w-3 h-3 text-black" />}
        </button>
      )}

      <nav className="flex-1 min-h-0 px-4 space-y-2 pb-32 overflow-y-auto overscroll-contain">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                !showLabels && "justify-center px-0",
                isActive 
                  ? "bg-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]" 
                  : "text-white/50 hover:text-white hover:bg-white/5",
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="active-pill" 
                  className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-full" 
                />
              )}
              <Icon className={cn(
                "w-5 h-5 transition-all duration-300", 
                isActive ? "text-primary scale-110" : "group-hover:text-primary group-hover:scale-110"
              )} />
              {showLabels && <span className={cn("font-semibold text-sm tracking-wide transition-opacity", isActive ? "opacity-100 text-primary" : "opacity-80 text-white/60 group-hover:opacity-100 group-hover:text-white")}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-3">
          {isAuthenticated ? (
            <div className="space-y-4">
              <div className={cn("flex items-center gap-3", !showLabels && "justify-center")}>
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-white/10 to-white/20 flex items-center justify-center shrink-0 border border-white/10">
                  <User className="w-5 h-5 text-white/80" />
                </div>
                {showLabels && (
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                    <p className="text-[10px] text-white/40 truncate font-mono">{user?.mobileNumber}</p>
                  </div>
                )}
              </div>
              <button
                onClick={logout}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300", 
                  !showLabels && "justify-center px-0"
                )}
              >
                <LogOut className="w-4 h-4" />
                {showLabels && <span className="text-xs font-bold uppercase tracking-wider">Sign Out</span>}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { onAuthClick(); if (isMobile) setIsMobileOpen(false); }}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-black font-bold text-sm tracking-tight transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_20px_-5px_rgba(var(--primary),0.4)]", 
                !showLabels && "px-0"
              )}
            >
              <User className="w-5 h-5" />
              {showLabels && <span>Get Started</span>}
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        <MobileMenuButton />
        <AnimatePresence>
          {isMobileOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 lg:hidden"
            />
          )}
        </AnimatePresence>
        {sidebarContent}
      </>
    );
  }

  return sidebarContent;
};

export { Sidebar as default };

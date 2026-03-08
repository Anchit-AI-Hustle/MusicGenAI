import React, { useState, useCallback } from 'react';
import { Home, Music, LayoutDashboard, LogOut, User, ChevronLeft, ChevronRight, Menu, X, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onAuthClick: () => void;
}

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'create', label: 'Create Music', icon: Music },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onAuthClick }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleNavigate = useCallback((page: string) => {
    onNavigate(page);
    if (isMobile) setIsMobileOpen(false);
  }, [onNavigate, isMobile]);

  const showLabels = !isCollapsed || isMobile;

  const MobileMenuButton = () => (
    <button onClick={() => setIsMobileOpen(true)} className="fixed top-4 left-4 z-40 p-3 rounded-xl bg-sidebar border border-sidebar-border lg:hidden">
      <Menu className="w-5 h-5 text-foreground" />
    </button>
  );

  const sidebarContent = (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col z-50",
        isMobile ? "w-64 transition-transform duration-200 ease-out" : cn(isCollapsed ? "w-20" : "w-64", "transition-all duration-200"),
        isMobile && !isMobileOpen && "-translate-x-full",
        isMobile && isMobileOpen && "translate-x-0",
      )}
    >
      {isMobile && (
        <button onClick={() => setIsMobileOpen(false)} className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors">
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center glow-primary flex-shrink-0">
            <Music className="w-5 h-5 text-primary-foreground" />
          </div>
          {showLabels && (
            <div className="overflow-hidden">
              <h1 className="font-display font-bold text-lg text-foreground whitespace-nowrap">MuseVibe Studio</h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">Create with AI</p>
            </div>
          )}
        </div>
      </div>

      {!isMobile && (
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-sidebar border border-sidebar-border flex items-center justify-center hover:bg-sidebar-accent transition-colors">
          {isCollapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
        </button>
      )}

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavigate(item.id)}
                  title={!showLabels ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group",
                    !showLabels && "justify-center px-3",
                    isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-primary")} />
                  {showLabels && <span className="font-medium whitespace-nowrap overflow-hidden">{item.label}</span>}
                  {isActive && showLabels && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        {isAuthenticated ? (
          <div className="space-y-3">
            <div className={cn("flex items-center gap-3 px-3 py-2", !showLabels && "justify-center px-0")}>
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              {showLabels && (
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.mobileNumber}</p>
                </div>
              )}
            </div>
            <button
              onClick={logout}
              title={!showLabels ? "Logout" : undefined}
              className={cn("w-full flex items-center gap-3 px-4 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors", !showLabels && "justify-center px-3")}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {showLabels && <span className="text-sm whitespace-nowrap overflow-hidden">Logout</span>}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { onAuthClick(); if (isMobile) setIsMobileOpen(false); }}
            className={cn("w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-primary text-primary-foreground font-medium transition-colors hover:opacity-90 glow-primary", !showLabels && "px-3")}
          >
            <User className="w-4 h-4 flex-shrink-0" />
            {showLabels && <span className="whitespace-nowrap overflow-hidden">Sign In</span>}
          </button>
        )}
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        <MobileMenuButton />
        {/* Overlay */}
        {isMobileOpen && (
          <div
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
        {sidebarContent}
      </>
    );
  }

  return sidebarContent;
};

export { Sidebar as default };

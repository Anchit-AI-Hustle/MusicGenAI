import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { MusicProvider } from '@/contexts/MusicContext';
import { PlayerProvider, usePlayer } from '@/contexts/PlayerContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthModal } from '@/components/auth/AuthModal';
import { GlobalPlayer } from '@/components/player/GlobalPlayer';
import { SystemDemoDiagnostics } from '@/components/system/SystemDemoDiagnostics';
import { HomePage } from './HomePage';
import { CreateMusicPage } from './CreateMusicPage';
import { DashboardPage } from './DashboardPage';
import { AccountSettingsPage } from './AccountSettingsPage';
import { SongDetailPage } from './SongDetailPage';
import { GlobalGenerationTicker } from '@/components/layout/GlobalGenerationTicker';
import { AnimatedBackground } from '@/components/layout/AnimatedBackground';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';

type Page = 'home' | 'create' | 'dashboard' | 'settings' | 'song-detail';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [songDetailParams, setSongDetailParams] = useState<{ creationId: string; trackId?: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isLoading } = useAuth();
  const isMobile = useIsMobile();
  const { currentTrack } = usePlayer();

  const handleNavigate = (page: string, params?: Record<string, string>) => {
    if (page === 'song-detail' && params?.creationId) {
      setSongDetailParams({ creationId: params.creationId, trackId: params.trackId });
    }
    setCurrentPage(page as Page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <HomePage onNavigate={handleNavigate} />;
      case 'create': return <CreateMusicPage onAuthClick={() => setShowAuthModal(true)} onNavigate={handleNavigate} />;
      case 'dashboard': return <DashboardPage onAuthClick={() => setShowAuthModal(true)} onNavigate={handleNavigate} />;
      case 'settings': return <AccountSettingsPage onAuthClick={() => setShowAuthModal(true)} onNavigate={handleNavigate} />;
      case 'song-detail': return songDetailParams ? (
        <SongDetailPage
          creationId={songDetailParams.creationId}
          trackId={songDetailParams.trackId}
          onBack={() => setCurrentPage('dashboard')}
        />
      ) : <DashboardPage onAuthClick={() => setShowAuthModal(true)} onNavigate={handleNavigate} />;
      default: return <HomePage onNavigate={handleNavigate} />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatedBackground />
      {/* Sidebar is rendered as a top-level sibling so no ancestor
          (overflow, transform, filter, perspective) can ever create
          a containing block that would let it scroll with the page.
          It is position: fixed and must remain locked to the viewport. */}
      <Sidebar
        currentPage={currentPage === 'song-detail' ? 'dashboard' : currentPage}
        onNavigate={handleNavigate}
        onAuthClick={() => setShowAuthModal(true)}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div className="min-h-screen bg-transparent relative overflow-x-hidden text-white selection:bg-primary/30">
        <GlobalGenerationTicker
          onNavigate={handleNavigate}
          sidebarOffsetClass={sidebarCollapsed ? 'lg:left-20' : 'lg:left-64'}
        />
        <main className={`${isMobile ? "pt-20" : `${sidebarCollapsed ? "ml-20" : "ml-64"} pt-14 transition-all duration-300`} ${currentTrack ? 'pb-28' : 'pb-[env(safe-area-inset-bottom,0px)]'}`}>
          {renderPage()}
        </main>
        <SystemDemoDiagnostics />
        <GlobalPlayer sidebarOffsetClass={sidebarCollapsed ? 'lg:left-20' : 'lg:left-64'} />
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    </>
  );
};

const Index: React.FC = () => (
  <AuthProvider>
    <MusicProvider>
      <PlayerProvider>
        <AppContent />
      </PlayerProvider>
    </MusicProvider>
  </AuthProvider>
);

export default Index;

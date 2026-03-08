import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { MusicProvider } from '@/contexts/MusicContext';
import { PlayerProvider, usePlayer } from '@/contexts/PlayerContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthModal } from '@/components/auth/AuthModal';
import { GlobalPlayer } from '@/components/player/GlobalPlayer';
import { HomePage } from './HomePage';
import { CreateMusicPage } from './CreateMusicPage';
import { DashboardPage } from './DashboardPage';
import { AccountSettingsPage } from './AccountSettingsPage';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';

type Page = 'home' | 'create' | 'dashboard' | 'settings';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { isLoading } = useAuth();
  const isMobile = useIsMobile();
  const { currentTrack } = usePlayer();

  const handleNavigate = (page: string) => setCurrentPage(page as Page);

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <HomePage onNavigate={handleNavigate} />;
      case 'create': return <CreateMusicPage onAuthClick={() => setShowAuthModal(true)} />;
      case 'dashboard': return <DashboardPage onAuthClick={() => setShowAuthModal(true)} onNavigate={handleNavigate} />;
      case 'settings': return <AccountSettingsPage onAuthClick={() => setShowAuthModal(true)} onNavigate={handleNavigate} />;
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
    <div className="min-h-screen bg-background">
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} onAuthClick={() => setShowAuthModal(true)} />
      <main className={`${isMobile ? "pt-16" : "ml-64 transition-all duration-300"} ${currentTrack ? 'pb-24' : ''}`}>
        {renderPage()}
      </main>
      <GlobalPlayer />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
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

import React, { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { MusicProvider } from '@/contexts/MusicContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthModal } from '@/components/auth/AuthModal';
import { HomePage } from './HomePage';
import { CreateMusicPage } from './CreateMusicPage';
import { DashboardPage } from './DashboardPage';

type Page = 'home' | 'create' | 'dashboard';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleNavigate = (page: string) => {
    setCurrentPage(page as Page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />;
      case 'create':
        return <CreateMusicPage onAuthClick={() => setShowAuthModal(true)} />;
      case 'dashboard':
        return (
          <DashboardPage 
            onAuthClick={() => setShowAuthModal(true)} 
            onNavigate={handleNavigate}
          />
        );
      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onAuthClick={() => setShowAuthModal(true)}
      />
      
      {/* Main content area */}
      <main className="ml-64">
        {renderPage()}
      </main>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
};

const Index: React.FC = () => {
  return (
    <AuthProvider>
      <MusicProvider>
        <AppContent />
      </MusicProvider>
    </AuthProvider>
  );
};

export default Index;

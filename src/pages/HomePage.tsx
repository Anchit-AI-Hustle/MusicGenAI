import React from 'react';
import { motion } from 'framer-motion';
import { Music, Wand2, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

const steps = [
  {
    icon: Music,
    title: 'Describe Your Vision',
    description: 'Tell us about the mood, energy, and atmosphere you want. Use words, themes, or even stories.',
  },
  {
    icon: Wand2,
    title: 'Refine with AI',
    description: 'Get smart suggestions to enhance your inputs. AI helps clarify and polish your creative intent.',
  },
  {
    icon: Sparkles,
    title: 'Receive Your Music',
    description: 'Watch as your ideas transform into fully produced music, ready to download and share.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen w-full">
      {/* Static Background - No JS animations */}
      <div className="fixed inset-0 bg-background pointer-events-none -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.05]" />
        <div className="absolute inset-0" style={{ 
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(34, 211, 238, 0.06) 0%, transparent 40%), radial-gradient(circle at 80% 50%, rgba(168, 85, 247, 0.06) 0%, transparent 40%)' 
        }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ 
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,1) 0%, transparent 100%)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-8 py-20">
        <div className="relative z-10 max-w-6xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center"
          >
            {/* Simple Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 mb-10">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs uppercase tracking-[0.25em] text-white/60 font-semibold">The Future of Sound</span>
            </div>

            {/* Main Title */}
            <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-black mb-8 leading-[0.95] tracking-tight">
              <span className="text-white block">Sonic Ideas</span>
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent italic block py-2">Transformed.</span>
            </h1>

            {/* Content */}
            <div className="max-w-2xl mx-auto mb-12">
              <p className="text-lg sm:text-xl text-white/50 leading-relaxed font-medium">
                Unlock professional-grade music production through artificial intelligence. 
                Describe your vision in plain words and watch it materialize into a 
                mastered composition in seconds.
              </p>
            </div>

            {/* Simple CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                onClick={() => onNavigate('create')}
                variant="glow"
                size="lg"
                className="px-10 py-6 text-lg"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Start Creating
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => onNavigate('dashboard')}
                className="px-8 py-6 text-lg border-white/10 hover:bg-white/5"
              >
                View Gallery
              </Button>
            </div>
          </motion.div>

          {/* Static Audio Visualizer - No JS animations */}
          <div className="mt-20 w-full max-w-4xl">
            <div className="h-24 flex items-end justify-center gap-0.5">
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-primary/40 to-primary rounded-t-sm"
                  style={{
                    height: `${12 + (i % 5) * 10 + Math.sin(i * 0.4) * 6}px`,
                    opacity: 0.35 + (i % 3) * 0.12
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 px-4 sm:px-8 border-t border-white/5 bg-black/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="p-8 rounded-3xl bg-white/5 border border-white/8 hover:bg-white/[0.07] hover:border-primary/30 transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-white/45 text-base leading-relaxed">{step.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto rounded-[40px] p-12 sm:p-16 text-center bg-gradient-to-b from-white/5 to-transparent border border-white/8">
          <h2 className="font-display text-3xl sm:text-5xl font-black text-white mb-6">Master Your Sound.</h2>
          <p className="text-white/50 text-lg mb-10 max-w-md mx-auto font-medium">
            Join thousands of creators producing high-fidelity music with MuseVibe's cutting-edge AI engine.
          </p>
          <Button
            onClick={() => onNavigate('create')}
            size="xl"
            className="px-12 py-7 text-xl"
          >
            Start Generating Now
          </Button>
        </div>
      </section>
    </div>
  );
};
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
    <div className="min-h-screen overflow-y-auto w-full selection:bg-primary/30">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-8 py-20 overflow-hidden">
        {/* Immersive mesh gradients */}
        <div className="absolute inset-0 z-0">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
              rotate: [0, 90, 0]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-primary/20 rounded-full blur-[120px]" 
          />
          <motion.div 
            animate={{ 
              scale: [1.2, 1, 1.2],
              opacity: [0.2, 0.4, 0.2],
              rotate: [0, -90, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-accent/20 rounded-full blur-[100px]" 
          />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            {/* Premium Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-2xl bg-white/5 border border-white/10 mb-10 shadow-2xl backdrop-blur-md"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold">The Future of Sound</span>
            </motion.div>

            {/* Main Title with staggered reveal */}
            <h1 className="font-display text-4xl sm:text-6xl md:text-8xl font-black mb-8 leading-[0.95] tracking-tight">
              <span className="text-white block">Sonic Ideas</span>
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent italic block py-2">Transformed.</span>
            </h1>

            {/* Content with glass background */}
            <div className="max-w-2xl mx-auto mb-12">
              <p className="text-lg sm:text-xl text-white/60 leading-relaxed font-medium">
                Unlock professional-grade music production through artificial intelligence. 
                Describe your vision in plain words and watch it materialize into a 
                mastered composition in seconds.
              </p>
            </div>

            {/* Luxury CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('create')}
                className="group relative px-10 py-5 rounded-3xl bg-primary text-black font-bold text-lg flex items-center gap-3 transition-all hover:shadow-[0_0_40px_rgba(var(--primary),0.5)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10">Start Creating</span>
                <ArrowRight className="relative z-10 w-5 h-5 transition-transform group-hover:translate-x-2" />
              </motion.button>
              
              <button 
                onClick={() => onNavigate('dashboard')}
                className="px-8 py-5 rounded-3xl bg-white/5 border border-white/10 text-white font-bold text-lg hover:bg-white/10 transition-all backdrop-blur-md"
              >
                View Gallery
              </button>
            </div>
          </motion.div>

          {/* Floating Element Decoration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 2 }}
            className="mt-20 w-full max-w-4xl"
          >
            <div className="relative h-40 flex items-center justify-center gap-4">
              {[...Array(40)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: [20, 100 * Math.random() + 20, 20],
                    opacity: [0.2, 0.8, 0.2]
                  }}
                  transition={{ 
                    duration: 1.5 + Math.random(), 
                    repeat: Infinity, 
                    delay: i * 0.05 
                  }}
                  className="w-1 md:w-2 bg-gradient-to-t from-primary/10 via-primary to-accent/50 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-32 px-4 sm:px-8 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="group relative p-10 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-primary/50 transition-all duration-500"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4 leading-tight">{step.title}</h3>
                  <p className="text-white/50 text-base leading-relaxed">{step.description}</p>
                  
                  <div className="absolute top-10 right-10 text-4xl font-black text-white/5 group-hover:text-primary/10 transition-colors">
                    0{i + 1}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Modern CTA */}
      <section className="py-40 px-4 sm:px-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-primary/5 blur-[150px] rotate-12 scale-150" />
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto rounded-[60px] p-20 text-center relative overflow-hidden bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-2xl"
        >
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-6">Master Your Sound.</h2>
            <p className="text-white/60 text-lg mb-10 max-w-md mx-auto font-medium">
              Join thousands of creators producing high-fidelity music with MuseVibe's cutting-edge AI engine.
            </p>
            <Button
              onClick={() => onNavigate('create')}
              className="px-12 py-7 rounded-3xl bg-white text-black font-black text-xl hover:bg-primary transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:shadow-primary/20"
            >
              Start Generating Now
            </Button>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

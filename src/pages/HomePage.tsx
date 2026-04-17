import React from 'react';
import { motion } from 'framer-motion';
import { Music, Wand2, Sparkles, ArrowRight, Layers, Zap, Disc3 } from 'lucide-react';
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
      {/* Immersive Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-mesh opacity-80" />
        
        {/* Dynamic Gradient Orbs */}
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, 100, 0],
            y: [0, -50, 0],
            opacity: [0.4, 0.6, 0.4]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute top-[10%] left-[10%] w-[600px] h-[600px] bg-primary/15 rounded-full blur-[150px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            x: [0, -80, 0],
            y: [0, 60, 0],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[20%] right-[5%] w-[700px] h-[700px] bg-accent/15 rounded-full blur-[180px]" 
        />
        
        {/* Floating Particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                y: [-100, 100],
                opacity: [0, 0.8, 0],
                scale: [0.5, 1.5]
              }}
              transition={{ 
                duration: 3 + Math.random() * 4, 
                repeat: Infinity, 
                delay: Math.random() * 2,
                ease: "linear"
              }}
              className="absolute w-1 h-1 bg-primary/30 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        {/* Grid Overlay */}
        <div className="absolute inset-0 grid-pattern opacity-30" />
        
        {/* Scanlines */}
        <div className="absolute inset-0 scanlines opacity-20" />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-8 py-20 overflow-hidden perspective-3d">
        {/* 3D Floating Elements */}
        <motion.div 
          animate={{ rotateX: [0, 10, 0], rotateY: [0, -10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[15%] right-[10%] opacity-30 preserve-3d"
        >
          <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 border border-white/10 backdrop-blur-xl transform translate-z-20" />
        </motion.div>
        
        <motion.div 
          animate={{ rotateX: [0, -15, 0], rotateY: [0, 15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[25%] left-[8%] opacity-20 preserve-3d"
        >
          <div className="w-24 h-24 rounded-full sphere-effect" />
        </motion.div>

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 40, rotateX: -10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center preserve-3d"
          >
            {/* Premium Badge with Holographic Effect */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, rotateY: -30 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="relative inline-flex items-center gap-2 px-6 py-3 rounded-2xl mb-10 holographic glass-card"
            >
              <div className="absolute inset-0 neon-pulse rounded-2xl opacity-30" />
              <div className="relative z-10 flex items-center gap-2">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary animate-ping opacity-50" />
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold">The Future of Sound</span>
              </div>
            </motion.div>

            {/* Main Title with 3D Depth Effect */}
            <h1 className="font-display text-4xl sm:text-6xl md:text-8xl font-black mb-8 leading-[0.95] tracking-tight perspective-3d preserve-3d">
              <motion.span 
                initial={{ opacity: 0, translateZ: -50 }}
                animate={{ opacity: 1, translateZ: 0 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="text-white block"
              >
                Sonic Ideas
              </motion.span>
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent italic block py-2 relative">
                <motion.span
                  initial={{ opacity: 0, translateZ: -30 }}
                  animate={{ opacity: 1, translateZ: 0 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  className="relative"
                >
                  Transformed.
                  {/* Glow Effect */}
                  <span className="absolute inset-0 bg-gradient-to-r from-primary to-accent blur-xl opacity-30 -z-10" />
                </motion.span>
              </span>
            </h1>

            {/* Content with Glass Effect */}
            <div className="max-w-2xl mx-auto mb-12">
              <motion.div 
                initial={{ opacity: 0, translateZ: -20 }}
                animate={{ opacity: 1, translateZ: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="glass-card p-6 rounded-2xl inner-glow"
              >
                <p className="text-lg sm:text-xl text-white/60 leading-relaxed font-medium">
                  Unlock professional-grade music production through artificial intelligence. 
                  Describe your vision in plain words and watch it materialize into a 
                  mastered composition in seconds.
                </p>
              </motion.div>
            </div>

            {/* Luxury CTA with 3D Effects */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <motion.button
                whileHover={{ scale: 1.05, translateZ: 10 }}
                whileTap={{ scale: 0.98, translateZ: 0 }}
                onClick={() => onNavigate('create')}
                className="group relative px-10 py-5 rounded-3xl bg-primary text-black font-bold text-lg flex items-center gap-3 transition-all hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] overflow-hidden preserve-3d depth-shadow"
              >
                {/* 3D Layer */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* Shimmer */}
                <motion.div 
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" 
                />
                <span className="relative z-10">Start Creating</span>
                <ArrowRight className="relative z-10 w-5 h-5 transition-transform group-hover:translate-x-2" />
              </motion.button>
              
              <motion.button 
                whileHover={{ scale: 1.02, translateZ: 5 }}
                onClick={() => onNavigate('dashboard')}
                className="px-8 py-5 rounded-3xl bg-white/5 border border-white/10 text-white font-bold text-lg hover:bg-white/10 transition-all backdrop-blur-md glass-card"
              >
                View Gallery
              </motion.button>
            </div>
          </motion.div>

          {/* Audio Visualizer with 3D Bars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 2 }}
            className="mt-20 w-full max-w-4xl perspective-3d"
          >
            <div className="relative h-40 flex items-center justify-center gap-1">
              {[...Array(60)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: [15, 80 + Math.random() * 40, 15],
                    opacity: [0.3, 0.9, 0.3],
                    translateZ: [0, Math.random() * 20, 0]
                  }}
                  transition={{ 
                    duration: 1 + Math.random() * 0.5, 
                    repeat: Infinity, 
                    delay: i * 0.03,
                    ease: "easeInOut"
                  }}
                  className="w-1 md:w-2 bg-gradient-to-t from-primary via-primary to-accent rounded-full preserve-3d"
                  style={{
                    boxShadow: i % 5 === 0 ? '0 0 10px hsl(187, 86%, 53%, 0.5)' : 'none'
                  }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-32 px-4 sm:px-8 border-t border-white/5 bg-black/20 relative">
        {/* Spotlight Effect */}
        <div className="absolute inset-0 spotlight" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30, rotateX: -15 }}
                  whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.6 }}
                  className="group relative p-10 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-primary/50 transition-all duration-500 preserve-3d"
                >
                  {/* 3D Hover Glow */}
                  <div className="absolute inset-0 rounded-[40px] bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                  
                  {/* Card Stack Effect */}
                  <div className="absolute -bottom-2 -right-2 w-full h-full rounded-[40px] bg-white/5 -z-10 blur-md" />
                  
                  {/* Icon with 3D Effect */}
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:translate-z-10 transition-transform duration-500 preserve-3d">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Icon className="w-8 h-8 text-primary relative z-10" />
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

      {/* CTA Section */}
      <section className="py-40 px-4 sm:px-8 overflow-hidden relative">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <motion.div 
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full"
          />
          <motion.div 
            animate={{ rotate: [0, -360] }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-primary/10 rounded-full border-dashed"
          />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 50, rotateX: -10 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto rounded-[60px] p-20 text-center relative overflow-hidden glass-card depth-shadow"
        >
          {/* Holographic Border */}
          <div className="absolute inset-0 rounded-[60px] morph-border opacity-30" />
          
          <div className="relative z-10 flex flex-col items-center">
            <motion.div
              animate={{ rotateX: [0, 5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="preserve-3d"
            >
              <h2 className="text-4xl sm:text-6xl font-black text-white mb-6">Master Your Sound.</h2>
            </motion.div>
            
            <p className="text-white/60 text-lg mb-10 max-w-md mx-auto font-medium">
              Join thousands of creators producing high-fidelity music with MuseVibe's cutting-edge AI engine.
            </p>
            
            <motion.div
              whileHover={{ scale: 1.05, translateZ: 10 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={() => onNavigate('create')}
                className="px-12 py-7 rounded-3xl bg-white text-black font-black text-xl hover:bg-primary transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:shadow-primary/20 relative overflow-hidden"
              >
                {/* Shine Effect */}
                <motion.div 
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" 
                />
                <span className="relative z-10">Start Generating Now</span>
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};
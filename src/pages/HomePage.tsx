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
    <div className="min-h-screen overflow-y-auto">
      {/* Hero Section */}
      <section className="relative min-h-[70vh] sm:min-h-[80vh] flex items-center justify-center px-4 sm:px-8 py-12 sm:py-20">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-40 sm:w-80 h-40 sm:h-80 bg-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 sm:mb-8"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs sm:text-sm text-primary font-medium">AI-Powered Music Creation</span>
            </motion.div>

            {/* Main heading */}
            <h1 className="font-display text-3xl sm:text-5xl md:text-7xl font-bold mb-4 sm:mb-6 leading-tight">
              <span className="text-foreground">Create Music</span>
              <br />
              <span className="gradient-text">From Your Imagination</span>
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-4">
              Transform your ideas into fully produced tracks. Describe your vision, 
              and let our AI bring it to life with professional-quality music.
            </p>

            {/* CTA Button */}
            <Button
              onClick={() => onNavigate('create')}
              variant="glow"
              size="xl"
              className="group w-full sm:w-auto"
            >
              Create Music
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>

          {/* Animated waveform decoration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-12 sm:mt-16 flex items-end justify-center gap-1 h-12 sm:h-16"
          >
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1 sm:w-1.5 bg-gradient-to-t from-primary/50 to-primary rounded-full"
                animate={{
                  height: [12, 24 + Math.random() * 24, 12],
                }}
                transition={{
                  duration: 1 + Math.random() * 0.5,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
              Create professional music in three simple steps
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                  className="relative group"
                >
                  <div className="glass-card rounded-2xl p-6 sm:p-8 h-full transition-smooth hover:border-primary/30">
                    <div className="absolute -top-3 -left-3 sm:-top-4 sm:-left-4 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                      {index + 1}
                    </div>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-5 sm:mb-6 group-hover:bg-primary/20 transition-smooth">
                      <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="relative glass-card rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-16 text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
            <div className="relative">
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
                Ready to Create?
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg mb-6 sm:mb-8 max-w-md mx-auto">
                Start turning your musical ideas into reality. No experience needed.
              </p>
              <Button
                onClick={() => onNavigate('create')}
                variant="glow"
                size="xl"
                className="group w-full sm:w-auto"
              >
                Start Creating
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

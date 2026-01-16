import React from 'react';
import { motion } from 'framer-motion';
import { Music, Wand2, Sparkles, ArrowRight, Play } from 'lucide-react';
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
      <section className="relative min-h-[80vh] flex items-center justify-center px-8 py-20">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">AI-Powered Music Creation</span>
            </motion.div>

            {/* Main heading */}
            <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="text-foreground">Create Music</span>
              <br />
              <span className="gradient-text">From Your Imagination</span>
            </h1>

            {/* Subheading */}
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Transform your ideas into fully produced tracks. Describe your vision, 
              and let our AI bring it to life with professional-quality music.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                onClick={() => onNavigate('create')}
                variant="glow"
                size="xl"
                className="group"
              >
                Create Music
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                variant="glass"
                size="xl"
                className="group"
              >
                <Play className="w-5 h-5" />
                Watch Demo
              </Button>
            </div>
          </motion.div>

          {/* Animated waveform decoration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-16 flex items-end justify-center gap-1 h-16"
          >
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1.5 bg-gradient-to-t from-primary/50 to-primary rounded-full"
                animate={{
                  height: [16, 32 + Math.random() * 32, 16],
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
      <section className="py-24 px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Create professional music in three simple steps
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
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
                  <div className="glass-card rounded-2xl p-8 h-full transition-smooth hover:border-primary/30">
                    {/* Step number */}
                    <div className="absolute -top-4 -left-4 w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                      {index + 1}
                    </div>
                    
                    {/* Icon */}
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-smooth">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    
                    {/* Content */}
                    <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
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
      <section className="py-24 px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="relative glass-card rounded-3xl p-12 md:p-16 text-center overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
            
            <div className="relative">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
                Ready to Create?
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
                Start turning your musical ideas into reality. No experience needed.
              </p>
              <Button
                onClick={() => onNavigate('create')}
                variant="glow"
                size="xl"
                className="group"
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

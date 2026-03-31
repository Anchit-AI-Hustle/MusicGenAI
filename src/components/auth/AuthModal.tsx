import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, User, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('Anchit Tandon');
  const [mobileNumber, setMobileNumber] = useState('9873945238');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!mobileNumber.trim()) { setError('Please enter your phone number'); return; }
    setIsLoading(true);
    try {
      const result = await login(name, mobileNumber);
      if (!result.success) {
        setError(result.error || 'Login failed');
      } else {
        setName('Anchit Tandon');
        setMobileNumber('9873945238');
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth">
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-8">
            <h2 className="font-display text-2xl font-bold text-foreground mb-2">Welcome to MuseVibe Studio</h2>
            <p className="text-muted-foreground">Enter your details to sign in or create an account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input id="name" type="text" placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} className="pl-11 h-12 bg-input border-border focus:border-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Required for new accounts</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile" className="text-foreground">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input id="mobile" type="tel" placeholder="Enter your phone number" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))} className="pl-11 h-12 bg-input border-border focus:border-primary" />
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-destructive text-sm text-center bg-destructive/10 py-2 px-3 rounded-lg">
                {error}
              </motion.p>
            )}

            <Button type="submit" disabled={isLoading || !mobileNumber} className="w-full h-12 bg-gradient-primary text-primary-foreground font-medium glow-primary hover:opacity-90 transition-smooth">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (<>Continue <ArrowRight className="w-4 h-4 ml-2" /></>)}
            </Button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

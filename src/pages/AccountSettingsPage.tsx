import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Phone, Save, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface AccountSettingsPageProps {
  onAuthClick: () => void;
  onNavigate: (page: string) => void;
}

export const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({ onAuthClick, onNavigate }) => {
  const { user, isAuthenticated, updateProfile, deleteAccount } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <User className="w-10 h-10 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-4">Account Settings</h2>
          <p className="text-muted-foreground mb-8">Sign in to manage your account.</p>
          <Button onClick={onAuthClick} variant="glow" size="lg">Sign In to Continue</Button>
        </motion.div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    if (!mobileNumber.trim()) { toast.error('Phone number cannot be empty'); return; }
    setIsSaving(true);
    const updates: { name?: string; mobileNumber?: string } = {};
    if (name.trim() !== user.name) updates.name = name;
    if (mobileNumber.trim() !== user.mobileNumber) updates.mobileNumber = mobileNumber;

    if (Object.keys(updates).length === 0) {
      toast.info('No changes to save');
      setIsSaving(false);
      return;
    }

    const result = await updateProfile(updates);
    setIsSaving(false);
    if (result.success) {
      toast.success('Profile updated!');
    } else {
      toast.error(result.error || 'Failed to update profile');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteAccount();
    setIsDeleting(false);
    if (result.success) {
      toast.success('Account deleted');
      onNavigate('home');
    } else {
      toast.error(result.error || 'Failed to delete account');
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">Account Settings</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Manage your profile and account</p>
        </motion.div>

        {/* Profile Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-xl p-4 sm:p-6 mb-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-6">Profile Information</h2>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="settings-name" className="text-foreground">Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input id="settings-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="pl-11 bg-input border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-phone" className="text-foreground">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input id="settings-phone" type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))} className="pl-11 bg-input border-border" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={isSaving} className="bg-gradient-primary text-primary-foreground glow-primary hover:opacity-90">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </motion.div>

        {/* Danger Zone */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-4 sm:p-6 border border-destructive/30">
          <h2 className="font-display text-lg font-semibold text-destructive mb-2">Danger Zone</h2>
          <p className="text-muted-foreground text-sm mb-4">Deleting your account will permanently remove all your songs, albums, and data.</p>
          {!showDeleteConfirm ? (
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Account
            </Button>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-foreground flex-1">Are you sure? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

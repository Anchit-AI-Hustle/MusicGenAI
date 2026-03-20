import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  name: string;
  mobileNumber: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (name: string, mobileNumber: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (updates: { name?: string; mobileNumber?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapAuthError(error?: { message?: string; code?: string } | null): string {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code || '';

  if (code === 'PGRST116') return 'User not found.';
  if (message.includes('invalid api key')) return 'Authentication service is temporarily unavailable. Please try again.';
  if (message.includes('failed to fetch') || message.includes('network')) return 'Network error. Please check your connection and try again.';
  if (message.includes('jwt') || message.includes('token')) return 'Authentication token is invalid. Please refresh the app and try again.';

  return error?.message || 'An authentication error occurred. Please try again.';
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const savedUserId = localStorage.getItem('harmonyai_user_id');
        if (savedUserId) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', savedUserId)
            .single();

          if (data && !error) {
            setUser({ id: data.id, name: data.name, mobileNumber: data.mobile_number });
          } else {
            if (error && error.code !== 'PGRST116') {
              console.error('Supabase load user error (profiles):', error);
            }
            localStorage.removeItem('harmonyai_user_id');
          }
        }
      } catch {
        localStorage.removeItem('harmonyai_user_id');
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (name: string, mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if user exists by phone number
      const { data: existing, error: selectError } = await supabase
        .from('profiles')
        .select('*')
        .eq('mobile_number', mobileNumber.trim())
        .single();

      let profile: { id: string; name: string; mobile_number: string } | null = null;

      if (existing && !selectError) {
        // Existing user — login
        profile = existing;
      } else if (selectError && selectError.code === 'PGRST116') {
        // No user found, create new user
        if (!name.trim()) {
          return { success: false, error: 'Please enter your name to create an account.' };
        }
        const { data, error: insertError } = await supabase
          .from('profiles')
          .insert({ name: name.trim(), mobile_number: mobileNumber.trim() })
          .select()
          .single();

        if (insertError || !data) {
          console.error('Supabase insert error (profiles):', insertError);
          return { success: false, error: mapAuthError(insertError) };
        }
        profile = data;
      } else {
        // Other error occurred
        console.error('Supabase select error (profiles):', selectError);
        return { success: false, error: mapAuthError(selectError) };
      }

      if (!profile) {
        return { success: false, error: 'Failed to process user data. Please try again.' };
      }

      const loggedInUser: User = { id: profile.id, name: profile.name, mobileNumber: profile.mobile_number };
      setUser(loggedInUser);
      localStorage.setItem('harmonyai_user_id', profile.id);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Unable to sign in right now. Please try again.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('harmonyai_user_id');
  };

  const updateProfile = async (updates: { name?: string; mobileNumber?: string }): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not logged in.' };
    try {
      const dbUpdates: Record<string, string> = {};
      if (updates.name) dbUpdates.name = updates.name.trim();
      if (updates.mobileNumber) dbUpdates.mobile_number = updates.mobileNumber.trim();

      if (updates.mobileNumber) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('mobile_number', updates.mobileNumber.trim())
          .neq('id', user.id)
          .single();
        if (existing) return { success: false, error: 'This phone number is already in use.' };
      }

      const { error } = await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
      if (error) return { success: false, error: 'Failed to update profile.' };

      setUser(prev => prev ? {
        ...prev,
        name: updates.name?.trim() || prev.name,
        mobileNumber: updates.mobileNumber?.trim() || prev.mobileNumber,
      } : null);
      return { success: true };
    } catch {
      return { success: false, error: 'An error occurred.' };
    }
  };

  const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not logged in.' };
    try {
      // Delete all user's music creations (tracks cascade via FK or manual)
      await supabase.from('music_creations').delete().eq('user_id', user.id);
      // Delete profile
      const { error } = await supabase.from('profiles').delete().eq('id', user.id);
      if (error) return { success: false, error: 'Failed to delete account.' };
      logout();
      return { success: true };
    } catch {
      return { success: false, error: 'An error occurred.' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, updateProfile, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

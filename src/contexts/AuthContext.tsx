import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

const AUTH_USER_ID_KEY = 'harmonyai_user_id';
const DEFAULT_USER_NAME = 'Anchit Tandon';
const DEFAULT_USER_MOBILE = '9873945238';

function mapAuthDbError(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  const message = (error?.message || '').toLowerCase();
  const code = (error?.code || '').toLowerCase();
  const status = Number(error?.status || 0);

  if (message.includes('relation') && message.includes('profiles') && message.includes('does not exist')) {
    return 'Supabase preview branch is missing schema (profiles table). Run migrations or use production Supabase env.';
  }
  if (status === 401 || code === 'pgrst301' || message.includes('401') || message.includes('unauthorized')) {
    return 'Database auth failed (stale app cache or invalid key). Refresh the app and try again.';
  }
  if (message.includes('invalid api key') || message.includes('jwt')) {
    return 'Supabase env vars are invalid. Verify URL/anon key in Vercel for this environment.';
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Supabase RLS policy blocks this operation for anon users.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Network error while contacting Supabase.';
  }
  if (error?.message) return error.message;

  return 'Database is unavailable. Please try again.';
}

function toUser(row: { id: string; name: string; mobile_number: string }): User {
  return {
    id: row.id,
    name: row.name,
    mobileNumber: row.mobile_number,
  };
}

async function ensureDefaultAccountExists() {
  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('id,name,mobile_number')
    .eq('mobile_number', DEFAULT_USER_MOBILE)
    .maybeSingle();

  if (selectError) {
    console.warn('[Auth] Default profile check failed:', selectError.message);
    return;
  }
  if (existing) return;

  const { error: insertError } = await supabase.from('profiles').insert({
    name: DEFAULT_USER_NAME,
    mobile_number: DEFAULT_USER_MOBILE,
  });
  if (insertError) {
    console.warn('[Auth] Default profile seed failed:', insertError.message);
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        await ensureDefaultAccountExists();

        const savedUserId = localStorage.getItem(AUTH_USER_ID_KEY);
        if (!savedUserId) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('id,name,mobile_number')
          .eq('id', savedUserId)
          .maybeSingle();

        if (error || !data) {
          localStorage.removeItem(AUTH_USER_ID_KEY);
          return;
        }

        setUser(toUser(data));
      } finally {
        setIsLoading(false);
      }
    };

    void loadUser();
  }, []);

  const login = async (name: string, mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    const normalizedName = name.trim();
    const normalizedMobile = mobileNumber.trim();

    if (!normalizedMobile) {
      return { success: false, error: 'Please enter your phone number.' };
    }

    const { data: existing, error: selectError } = await supabase
      .from('profiles')
      .select('id,name,mobile_number')
      .eq('mobile_number', normalizedMobile)
      .maybeSingle();

    if (selectError) {
      return { success: false, error: mapAuthDbError(selectError) };
    }

    if (existing) {
      setUser(toUser(existing));
      localStorage.setItem(AUTH_USER_ID_KEY, existing.id);
      return { success: true };
    }

    if (!normalizedName) {
      return { success: false, error: 'Please enter your name to create an account.' };
    }

    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert({ name: normalizedName, mobile_number: normalizedMobile })
      .select('id,name,mobile_number')
      .single();

    if (insertError || !created) {
      return { success: false, error: mapAuthDbError(insertError) };
    }

    setUser(toUser(created));
    localStorage.setItem(AUTH_USER_ID_KEY, created.id);
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_USER_ID_KEY);
  };

  const updateProfile = async (updates: { name?: string; mobileNumber?: string }): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not logged in.' };

    const dbUpdates: Record<string, string> = {};
    if (updates.name) dbUpdates.name = updates.name.trim();
    if (updates.mobileNumber) dbUpdates.mobile_number = updates.mobileNumber.trim();

    if (updates.mobileNumber) {
      const { data: existing, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('mobile_number', updates.mobileNumber.trim())
        .neq('id', user.id)
        .maybeSingle();

      if (checkError) return { success: false, error: mapAuthDbError(checkError) };
      if (existing) return { success: false, error: 'This phone number is already in use.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(dbUpdates)
      .eq('id', user.id)
      .select('id,name,mobile_number')
      .single();

    if (error || !data) return { success: false, error: mapAuthDbError(error) };

    setUser(toUser(data));
    return { success: true };
  };

  const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not logged in.' };

    await supabase.from('music_creations').delete().eq('user_id', user.id);
    const { error } = await supabase.from('profiles').delete().eq('id', user.id);

    if (error) return { success: false, error: mapAuthDbError(error) };

    logout();
    return { success: true };
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

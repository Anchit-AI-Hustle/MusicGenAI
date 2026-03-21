import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';

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

function isSupabaseClientFailure(error?: { message?: string; code?: string } | null): boolean {
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('invalid api key') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('auth')
  );
}

const AUTH_RETRY_DELAYS_MS = [250, 800];

async function withTransientRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= AUTH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === AUTH_RETRY_DELAYS_MS.length) break;
      await new Promise(resolve => setTimeout(resolve, AUTH_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

async function restProfilesRequest<T = any>(path: string, init: RequestInit): Promise<T> {
  const response = await withTransientRetry(async () => {
    return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init.headers || {}),
      },
    });
  });

  if (!response.ok) {
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const err = new Error(payload?.message || payload?.hint || `Profiles request failed (${response.status})`) as Error & { code?: string };
    err.code = payload?.code;
    throw err;
  }

  if (response.status === 204) return [] as T;
  return (await response.json()) as T;
}

async function fetchProfileByMobileFallback(mobileNumber: string) {
  const rows = await restProfilesRequest<Array<{ id: string; name: string; mobile_number: string }>>(
    `/profiles?select=id,name,mobile_number&mobile_number=eq.${encodeURIComponent(mobileNumber)}&limit=1`,
    { method: 'GET' },
  );
  return rows?.[0] ?? null;
}

async function fetchProfileByIdFallback(id: string) {
  const rows = await restProfilesRequest<Array<{ id: string; name: string; mobile_number: string }>>(
    `/profiles?select=id,name,mobile_number&id=eq.${encodeURIComponent(id)}&limit=1`,
    { method: 'GET' },
  );
  return rows?.[0] ?? null;
}

async function insertProfileFallback(name: string, mobileNumber: string) {
  const rows = await restProfilesRequest<Array<{ id: string; name: string; mobile_number: string }>>(
    '/profiles',
    {
      method: 'POST',
      body: JSON.stringify([{ name, mobile_number: mobileNumber }]),
    },
  );
  return rows?.[0] ?? null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const savedUserId = localStorage.getItem('harmonyai_user_id');
        if (savedUserId) {
          const { data, error } = await withTransientRetry(async () => {
            return await supabase
              .from('profiles')
              .select('*')
              .eq('id', savedUserId)
              .single();
          });

          let profile = data;

          if (!profile && error && isSupabaseClientFailure(error)) {
            try {
              profile = await fetchProfileByIdFallback(savedUserId);
            } catch (fallbackError) {
              console.error('Supabase fallback load user error (profiles):', fallbackError);
            }
          }

          if (profile && !error) {
            setUser({ id: profile.id, name: profile.name, mobileNumber: profile.mobile_number });
          } else if (profile) {
            setUser({ id: profile.id, name: profile.name, mobileNumber: profile.mobile_number });
          } else {
            if (error && error.code !== 'PGRST116') {
              console.error('Supabase load user error (profiles):', error);
            }
            if (!error || !isSupabaseClientFailure(error)) {
              localStorage.removeItem('harmonyai_user_id');
            }
          }
        }
      } catch (error) {
        console.error('Auth bootstrap error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (name: string, mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const normalizedMobile = mobileNumber.trim();
      const normalizedName = name.trim();
      // Check if user exists by phone number
      const { data: existing, error: selectError } = await withTransientRetry(async () => {
        return await supabase
          .from('profiles')
          .select('*')
          .eq('mobile_number', normalizedMobile)
          .single();
      });

      let profile: { id: string; name: string; mobile_number: string } | null = null;

      if (existing && !selectError) {
        // Existing user — login
        profile = existing;
      } else if (selectError && isSupabaseClientFailure(selectError)) {
        // Fallback path: direct REST query against the same Supabase backend.
        try {
          const fallbackExisting = await fetchProfileByMobileFallback(normalizedMobile);
          if (fallbackExisting) {
            profile = fallbackExisting;
          } else {
            if (!normalizedName) {
              return { success: false, error: 'Please enter your name to create an account.' };
            }
            profile = await insertProfileFallback(normalizedName, normalizedMobile);
            if (!profile) {
              return { success: false, error: 'Unable to create account. Please try again.' };
            }
          }
        } catch (fallbackError: any) {
          console.error('Supabase fallback auth error (profiles):', fallbackError);
          return { success: false, error: mapAuthError(fallbackError) };
        }
      } else if (selectError && selectError.code === 'PGRST116') {
        // No user found, create new user
        if (!normalizedName) {
          return { success: false, error: 'Please enter your name to create an account.' };
        }
        const { data, error: insertError } = await withTransientRetry(async () => {
          return await supabase
            .from('profiles')
            .insert({ name: normalizedName, mobile_number: normalizedMobile })
            .select()
            .single();
        });

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
        const { data: existing } = await withTransientRetry(async () => {
          return await supabase
            .from('profiles')
            .select('id')
            .eq('mobile_number', updates.mobileNumber.trim())
            .neq('id', user.id)
            .single();
        });
        if (existing) return { success: false, error: 'This phone number is already in use.' };
      }

      const { error } = await withTransientRetry(async () => {
        return await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
      });
      if (error && isSupabaseClientFailure(error)) {
        try {
          await restProfilesRequest(`/profiles?id=eq.${encodeURIComponent(user.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(dbUpdates),
          });
        } catch {
          return { success: false, error: 'Failed to update profile.' };
        }
      } else if (error) {
        return { success: false, error: 'Failed to update profile.' };
      }

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
      await withTransientRetry(async () => {
        await supabase.from('music_creations').delete().eq('user_id', user.id);
      });
      // Delete profile
      const { error } = await withTransientRetry(async () => {
        return await supabase.from('profiles').delete().eq('id', user.id);
      });
      if (error && isSupabaseClientFailure(error)) {
        try {
          await restProfilesRequest(`/profiles?id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' });
        } catch {
          return { success: false, error: 'Failed to delete account.' };
        }
      } else if (error) {
        return { success: false, error: 'Failed to delete account.' };
      }
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

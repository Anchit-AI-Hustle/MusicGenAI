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
  login: (mobileNumber: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, mobileNumber: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const savedUserId = localStorage.getItem('harmonyai_user_id');
        if (savedUserId) {
          // Fetch fresh user data from Supabase
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', savedUserId)
            .single();

          if (data && !error) {
            setUser({
              id: data.id,
              name: data.name,
              mobileNumber: data.mobile_number,
            });
          } else {
            // Invalid stored ID, clear it
            localStorage.removeItem('harmonyai_user_id');
          }
        }
      } catch (error) {
        console.error('Error loading user:', error);
        localStorage.removeItem('harmonyai_user_id');
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Find user by mobile number in Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('mobile_number', mobileNumber)
        .single();

      if (error || !data) {
        return { success: false, error: 'Account not found. Please sign up first.' };
      }

      const loggedInUser: User = {
        id: data.id,
        name: data.name,
        mobileNumber: data.mobile_number,
      };

      setUser(loggedInUser);
      localStorage.setItem('harmonyai_user_id', data.id);
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login.' };
    }
  };

  const signup = async (name: string, mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('mobile_number', mobileNumber)
        .single();

      if (existingUser) {
        return { success: false, error: 'An account with this mobile number already exists.' };
      }

      // Create new profile in Supabase
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          name: name.trim(),
          mobile_number: mobileNumber.trim(),
        })
        .select()
        .single();

      if (error) {
        console.error('Signup error:', error);
        return { success: false, error: 'Failed to create account. Please try again.' };
      }

      const newUser: User = {
        id: data.id,
        name: data.name,
        mobileNumber: data.mobile_number,
      };

      setUser(newUser);
      localStorage.setItem('harmonyai_user_id', data.id);
      
      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'An error occurred during signup.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('harmonyai_user_id');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!user, 
      isLoading,
      login, 
      signup, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  mobileNumber: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (mobileNumber: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, mobileNumber: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simulated user database (in-memory for now)
const mockUsers: Map<string, User> = new Map();

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('harmonyai_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = async (mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const existingUser = mockUsers.get(mobileNumber);
    if (existingUser) {
      setUser(existingUser);
      localStorage.setItem('harmonyai_user', JSON.stringify(existingUser));
      return { success: true };
    }
    
    return { success: false, error: 'Account not found. Please sign up first.' };
  };

  const signup = async (name: string, mobileNumber: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (mockUsers.has(mobileNumber)) {
      return { success: false, error: 'An account with this mobile number already exists.' };
    }
    
    const newUser: User = {
      id: crypto.randomUUID(),
      name,
      mobileNumber,
    };
    
    mockUsers.set(mobileNumber, newUser);
    setUser(newUser);
    localStorage.setItem('harmonyai_user', JSON.stringify(newUser));
    
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('harmonyai_user');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, signup, logout }}>
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

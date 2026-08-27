import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type UserRole = 'ADMIN' | 'TEACHER';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  avatar?: string;
  createdAt?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  register: (data: { name: string; email: string; role: UserRole }) => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const MOCK_STORAGE_KEY = 'auth_user_session';

const DEMO_ADMIN: User = {
  id: 'usr-admin-1',
  name: 'Sistem Yöneticisi',
  email: 'admin@okul.k12.tr',
  role: 'ADMIN',
  approvalStatus: 'APPROVED',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
  createdAt: new Date().toISOString(),
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initializeAuth = () => {
      try {
        const storedUser = localStorage.getItem(MOCK_STORAGE_KEY);
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        } else {
          setUser(DEMO_ADMIN);
          localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(DEMO_ADMIN));
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(async (email: string, role: UserRole = 'TEACHER') => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const mockUser: User = {
        id: `usr-${Date.now()}`,
        name: email.split('@')[0].replace('.', ' '),
        email,
        role: email.includes('admin') ? 'ADMIN' : role,
        approvalStatus: email.includes('pending') ? 'PENDING' : 'APPROVED',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        createdAt: new Date().toISOString(),
      };

      setUser(mockUser);
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(mockUser));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: { name: string; email: string; role: UserRole }) => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const newUser: User = {
        id: `usr-${Date.now()}`,
        name: data.name,
        email: data.email,
        role: data.role,
        approvalStatus: data.role === 'ADMIN' ? 'APPROVED' : 'PENDING',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
        createdAt: new Date().toISOString(),
      };

      setUser(newUser);
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(newUser));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(MOCK_STORAGE_KEY);
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        register,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

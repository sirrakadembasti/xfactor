"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Role, SafeUser } from "@/types";

interface AuthContextType {
  user: SafeUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, role?: Role) => Promise<boolean>;
  logout: () => void;
  switchRole: (role: Role) => void;
  updateUser: (userData: Partial<SafeUser>) => void;
}

const DEFAULT_USERS: Record<Role, SafeUser> = {
  STUDENT: {
    id: "user-student-1",
    name: "Ali Yılmaz",
    email: "ogrenci@lms.edu.tr",
    role: "STUDENT",
  },
  TEACHER: {
    id: "user-teacher-1",
    name: "Prof. Dr. Ayşe Demir",
    email: "ogretmen@lms.edu.tr",
    role: "TEACHER",
  },
  ADMIN: {
    id: "user-admin-1",
    name: "Sistem Yöneticisi",
    email: "admin@lms.edu.tr",
    role: "ADMIN",
  },
};

const STORAGE_KEY = "online_exam_auth_user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      } else {
        // Varsayılan olarak öğrenci rolüyle başlat
        const initialUser = DEFAULT_USERS.STUDENT;
        setUser(initialUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialUser));
      }
    } catch (error) {
      console.error("Kullanıcı oturum durumu yüklenirken hata oluştu:", error);
      setUser(DEFAULT_USERS.STUDENT);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, role?: Role): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Rol bazlı veya dinamik giriş simülasyonu
      const targetRole = role || (email.includes("admin") ? "ADMIN" : email.includes("ogretmen") ? "TEACHER" : "STUDENT");
      const loggedUser: SafeUser = {
        id: `user-${targetRole.toLowerCase()}-${Date.now().toString().slice(-4)}`,
        name: targetRole === "ADMIN" ? "Sistem Yöneticisi" : targetRole === "TEACHER" ? "Prof. Dr. Ayşe Demir" : "Ali Yılmaz",
        email,
        role: targetRole,
      };

      setUser(loggedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
      toast.success(`Hoş geldiniz, ${loggedUser.name}`);
      return true;
    } catch (error) {
      console.error("Giriş hatası:", error);
      toast.error("Giriş yapılırken bir hata oluştu.");
      return false;
    } finally {
      setIsLoading(false);
    }
  },\ []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    toast.info("Oturum kapatıldı.");
  }, []);

  const switchRole = useCallback((newRole: Role) => {
    const mockUser = DEFAULT_USERS[newRole];
    if (mockUser) {
      setUser(mockUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
      toast.success(`Rol değiştirildi: ${newRole === "ADMIN" ? "Yönetici" : newRole === "TEACHER" ? "Öğretmen" : "Öğrenci"}`);
    }
  }, []);

  const updateUser = useCallback((userData: Partial<SafeUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...userData };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
        switchRole,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth AuthProvider kapsayıcısı içinde kullanılmalıdır.");
  }
  return context;
};

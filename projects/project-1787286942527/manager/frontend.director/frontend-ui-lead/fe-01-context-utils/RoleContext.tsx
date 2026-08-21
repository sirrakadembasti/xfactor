"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

export type UserRole = "ADMIN" | "TEACHER" | "STUDENT";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  avatar: string;
  badgeColor: string;
}

export const MOCK_USERS: Record<UserRole, MockUser> = {
  ADMIN: {
    id: "user-admin-1",
    name: "Sistem Yöneticisi",
    email: "admin@lms.local",
    role: "ADMIN",
    title: "Platform Admini",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Admin&backgroundColor=6366f1",
    badgeColor: "bg-rose-500/15 text-rose-600 border-rose-200 dark:border-rose-800",
  },
  TEACHER: {
    id: "user-teacher-1",
    name: "Ali Hoca",
    email: "ali.hoca@lms.local",
    role: "TEACHER",
    title: "Matematik & Geometri Öğretmeni",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=AliHoca&backgroundColor=3b82f6",
    badgeColor: "bg-indigo-500/15 text-indigo-600 border-indigo-200 dark:border-indigo-800",
  },
  STUDENT: {
    id: "user-student-1",
    name: "Zeynep Kaya",
    email: "zeynep.kaya@lms.local",
    role: "STUDENT",
    title: "11. Sınıf Sayısal Öğrencisi",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Zeynep&backgroundColor=10b981",
    badgeColor: "bg-emerald-500/15 text-emerald-600 border-emerald-200 dark:border-emerald-800",
  },
};

interface RoleContextType {
  currentUser: MockUser;
  activeRole: UserRole;
  switchRole: (role: UserRole) => void;
  availableRoles: MockUser[];
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const STORAGE_KEY = "lms_active_mock_role";

export function RoleProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRole] = useState<UserRole>("TEACHER");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const storedRole = localStorage.getItem(STORAGE_KEY) as UserRole | null;
      if (storedRole && MOCK_USERS[storedRole]) {
        setActiveRole(storedRole);
      }
    } catch (error) {
      console.error("LocalStorage erişim hatası:", error);
    }
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    setActiveRole(role);
    try {
      localStorage.setItem(STORAGE_KEY, role);
    } catch (error) {
      console.error("LocalStorage kayıt hatası:", error);
    }
  }, []);

  const currentUser = MOCK_USERS[activeRole];
  const availableRoles = Object.values(MOCK_USERS);

  const value: RoleContextType = {
    currentUser,
    activeRole,
    switchRole,
    availableRoles,
    isAdmin: activeRole === "ADMIN",
    isTeacher: activeRole === "TEACHER",
    isStudent: activeRole === "STUDENT",
  };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextType {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole kancası RoleProvider sarmalayıcısı içerisinde kullanılmalıdır.");
  }
  return context;
}

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface RoleContextType {
  currentRole: UserRole;
  currentUser: UserProfile;
  switchRole: (role: UserRole) => void;
  setCustomUser: (user: UserProfile) => void;
}

const defaultUsers: Record<UserRole, UserProfile> = {
  ADMIN: {
    id: 'admin-1',
    name: 'Yönetici',
    email: 'admin@okul.com',
    role: 'ADMIN',
  },
  TEACHER: {
    id: 'teacher-1',
    name: 'Ahmet Öğretmen',
    email: 'ahmet@okul.com',
    role: 'TEACHER',
  },
  STUDENT: {
    id: 'student-1',
    name: 'Zeynep Öğrenci',
    email: 'zeynep@okul.com',
    role: 'STUDENT',
  },
};

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole>('ADMIN');
  const [currentUser, setCurrentUser] = useState<UserProfile>(defaultUsers.ADMIN);

  useEffect(() => {
    const savedRole = localStorage.getItem('app_role') as UserRole | null;
    if (savedRole && defaultUsers[savedRole]) {
      setCurrentRole(savedRole);
      setCurrentUser(defaultUsers[savedRole]);
    }
  }, []);

  const switchRole = (role: UserRole) => {
    setCurrentRole(role);
    setCurrentUser(defaultUsers[role]);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_role', role);
    }
  };

  const setCustomUser = (user: UserProfile) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
  };

  return (
    <RoleContext.Provider value={{ currentRole, currentUser, switchRole, setCustomUser }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

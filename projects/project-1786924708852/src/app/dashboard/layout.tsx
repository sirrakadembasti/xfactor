'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import { UserProfile } from '@/components/layout/UserProfileMenu';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [user, setUser] = useState<UserProfile>({
    id: 'user-1',
    name: 'Ahmet Yılmaz',
    email: 'ahmet.yilmaz@okul.k12.tr',
    role: 'admin',
  });

  const handleRoleChange = (newRole: 'admin' | 'teacher') => {
    setUser((prev) => ({
      ...prev,
      role: newRole,
      name: newRole === 'admin' ? 'Ahmet Yılmaz (Admin)' : 'Ayşe Öğretmen',
      email: newRole === 'admin' ? 'ahmet.admin@okul.k12.tr' : 'ayse.ogretmen@okul.k12.tr',
    }));
  };

  const handleLogout = () => {
    alert('Oturum kapatıldı.');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row font-sans text-gray-900 antialiased">
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Navbar
          user={user}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onRoleChange={handleRoleChange}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import MobileNav from '@/components/dashboard/MobileNav';

export default function DashboardLayout({ children }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Mock User State with Role-Based Access Control (Admin / Teacher / Student)
  const [user, setUser] = useState({
    name: 'Ahmet Yılmaz',
    email: 'ahmet.yilmaz@eduportal.com',
    role: 'admin',
    avatar: '',
  });

  const handleRoleChange = (newRole) => {
    setUser((prev) => ({ ...prev, role: newRole }));
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <Sidebar
        userRole={user.role}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Mobile Drawer Navigation */}
      <MobileNav
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        userRole={user.role}
      />

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          user={user}
          onRoleChange={handleRoleChange}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
        />

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

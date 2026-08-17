import React from 'react';
import { Keyboard, Trophy, BarChart3, Settings, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab = 'type', onSelectTab }) => {
  const navItems = [
    { id: 'type', label: 'Yazma Testi', icon: Keyboard },
    { id: 'leaderboard', label: 'Lider Tablosu', icon: Trophy },
    { id: 'stats', label: 'İstatistikler', icon: BarChart3 },
    { id: 'settings', label: 'Ayarlar', icon: Settings },
  ];

  return (
    <nav className="flex items-center gap-1 md:gap-2 bg-neutral-900/80 p-1.5 rounded-xl border border-neutral-800 shadow-inner backdrop-blur-md">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab && onSelectTab(item.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-400 border border-amber-500/30 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-neutral-400'}`} />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

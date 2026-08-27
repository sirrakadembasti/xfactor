import React from 'react';
import { Keyboard, Zap } from 'lucide-react';
import { Navbar } from './Navbar';
import { ThemeToggle } from '../common/ThemeToggle';
import { AudioPlayer } from '../common/AudioPlayer';

interface HeaderProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onSelectTab }) => {
  return (
    <header className="w-full max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-b border-neutral-800/80">
      <div
        onClick={() => onSelectTab && onSelectTab('type')}
        className="flex items-center gap-3 cursor-pointer group"
      >
        <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
          <Keyboard className="w-6 h-6 text-neutral-950 stroke-[2.5]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-neutral-100 font-mono">
              TYPE<span className="text-amber-400">MASTER</span>
            </h1>
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
              PRO
            </span>
          </div>
          <p className="text-xs text-neutral-400 hidden sm:block">Klavye Hız ve Doğruluk Testi</p>
        </div>
      </div>

      <Navbar activeTab={activeTab} onSelectTab={onSelectTab} />

      <div className="flex items-center gap-3">
        <AudioPlayer />
        <ThemeToggle />
      </div>
    </header>
  );
};

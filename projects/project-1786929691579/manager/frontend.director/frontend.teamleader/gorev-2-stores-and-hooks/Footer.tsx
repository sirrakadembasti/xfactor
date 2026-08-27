import React from 'react';
import { Command, Heart, Github, Sparkles } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full max-w-6xl mx-auto px-4 py-6 mt-auto border-t border-neutral-800/60 text-xs text-neutral-500 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-neutral-800/40 px-2 py-1 rounded border border-neutral-800 font-mono text-[11px]">
          <span className="px-1 bg-neutral-700 text-neutral-300 rounded">tab</span>
          <span>+</span>
          <span className="px-1 bg-neutral-700 text-neutral-300 rounded">enter</span>
          <span className="ml-1 text-neutral-400">- testi sıfırla</span>
        </div>
        <div className="flex items-center gap-1 bg-neutral-800/40 px-2 py-1 rounded border border-neutral-800 font-mono text-[11px]">
          <span className="px-1 bg-neutral-700 text-neutral-300 rounded">esc</span>
          <span className="ml-1 text-neutral-400">- hızlı menü</span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-neutral-400">
        <span>Geliştirildi</span>
        <Heart className="w-3.5 h-3.5 text-amber-500 fill-amber-500 mx-0.5" />
        <span>TypeMaster v2.0</span>
      </div>

      <div className="flex items-center gap-4">
        <a
          href="#"
          className="flex items-center gap-1.5 hover:text-amber-400 transition-colors"
        >
          <Github className="w-3.5 h-3.5" />
          <span>GitHub</span>
        </a>
        <span className="text-neutral-700">•</span>
        <span className="text-neutral-500 font-mono">TR / EN</span>
      </div>
    </footer>
  );
};

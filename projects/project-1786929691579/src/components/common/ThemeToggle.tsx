import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useSettingsStore, ThemeMode } from '../../store/useSettingsStore';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useSettingsStore();

  const themes: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'dark', label: 'Karanlık', icon: <Moon className="w-4 h-4" /> },
    { mode: 'light', label: 'Aydınlık', icon: <Sun className="w-4 h-4" /> },
    { mode: 'system', label: 'Sistem', icon: <Monitor className="w-4 h-4" /> },
  ];

  const handleNextTheme = () => {
    const modes: ThemeMode[] = ['dark', 'light', 'system'];
    const currentIndex = modes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % modes.length;
    setTheme(modes[nextIndex]);
  };

  const currentItem = themes.find((t) => t.mode === theme) || themes[0];

  return (
    <div className="flex items-center gap-1 bg-neutral-800/60 p-1 rounded-lg border border-neutral-700/50">
      {themes.map((t) => (
        <button
          key={t.mode}
          onClick={() => setTheme(t.mode)}
          title={`${t.label} Tema`}
          className={`p-1.5 rounded-md transition-all text-xs font-medium flex items-center gap-1 ${
            theme === t.mode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/40'
          }`}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
};

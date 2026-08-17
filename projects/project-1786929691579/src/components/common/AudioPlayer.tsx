import React, { useState } from 'react';
import { Volume2, VolumeX, Volume1, Settings2 } from 'lucide-react';
import { useSettingsStore, SoundPreset } from '../../store/useSettingsStore';

export const AudioPlayer: React.FC = () => {
  const {
    soundEnabled,
    soundVolume,
    soundPreset,
    setSoundEnabled,
    setSoundVolume,
    setSoundPreset,
  } = useSettingsStore();

  const [showMenu, setShowMenu] = useState(false);

  const presets: { id: SoundPreset; label: string }[] = [
    { id: 'mechanical', label: 'Mekanik Clack' },
    { id: 'typewriter', label: 'Daktilo' },
    { id: 'soft', label: 'Yumuşak' },
    { id: 'pop', label: 'Pop' },
    { id: 'silent', label: 'Sessiz' },
  ];

  return (
    <div className="relative flex items-center">
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        className={`p-2 rounded-lg transition-colors border ${
          soundEnabled
            ? 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
            : 'text-neutral-400 bg-neutral-800 border-neutral-700 hover:text-neutral-200'
        }`}
        title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
      >
        {soundEnabled ? (
          soundVolume > 0.5 ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <Volume1 className="w-4 h-4" />
          )
        ) : (
          <VolumeX className="w-4 h-4" />
        )}
      </button>

      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1.5 text-neutral-400 hover:text-amber-400 transition-colors ml-1"
        title="Ses Ayarları"
      >
        <Settings2 className="w-3.5 h-3.5" />
      </button>

      {showMenu && (
        <div className="absolute top-full right-0 mt-2 w-56 p-3 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl z-50 text-xs backdrop-blur-md">
          <div className="font-semibold text-neutral-300 mb-2 flex justify-between items-center">
            <span>Ses Ayarları</span>
            <span className="text-amber-400 font-mono">{Math.round(soundVolume * 100)}%</span>
          </div>

          <div className="mb-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="text-neutral-400 font-medium mb-1.5">Tuş Ses Efekti</div>
          <div className="grid grid-cols-1 gap-1">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => setSoundPreset(p.id)}
                className={`px-2.5 py-1.5 rounded-md text-left transition-all flex items-center justify-between ${
                  soundPreset === p.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                <span>{p.label}</span>
                {soundPreset === p.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

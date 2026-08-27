import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type SoundPreset = 'mechanical' | 'typewriter' | 'soft' | 'pop' | 'silent';

export interface SettingsState {
  theme: ThemeMode;
  soundEnabled: boolean;
  soundVolume: number;
  soundPreset: SoundPreset;
  keySoundVolume: number;
  musicVolume: number;
  caretStyle: 'line' | 'block' | 'underline' | 'smooth';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  fontFamily: 'font-mono' | 'font-sans' | 'font-serif';
  showLiveWpm: boolean;
  showLiveAccuracy: boolean;
  showTimer: boolean;
  showProgressBar: boolean;
  smoothCaret: boolean;
  setTheme: (theme: ThemeMode) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setSoundPreset: (preset: SoundPreset) => void;
  setKeySoundVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setCaretStyle: (style: SettingsState['caretStyle']) => void;
  setFontSize: (size: SettingsState['fontSize']) => void;
  setFontFamily: (family: SettingsState['fontFamily']) => void;
  toggleSetting: (key: keyof SettingsState) => void;
  resetSettings: () => void;
}

const defaultSettings = {
  theme: 'dark' as ThemeMode,
  soundEnabled: true,
  soundVolume: 0.7,
  soundPreset: 'mechanical' as SoundPreset,
  keySoundVolume: 0.8,
  musicVolume: 0.3,
  caretStyle: 'line' as const,
  fontSize: 'md' as const,
  fontFamily: 'font-mono' as const,
  showLiveWpm: true,
  showLiveAccuracy: true,
  showTimer: true,
  showProgressBar: true,
  smoothCaret: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setTheme: (theme) => set({ theme }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setSoundVolume: (soundVolume) => set({ soundVolume }),
      setSoundPreset: (soundPreset) => set({ soundPreset }),
      setKeySoundVolume: (keySoundVolume) => set({ keySoundVolume }),
      setMusicVolume: (musicVolume) => set({ musicVolume }),
      setCaretStyle: (caretStyle) => set({ caretStyle }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      toggleSetting: (key) =>
        set((state) => {
          const val = state[key];
          if (typeof val === 'boolean') {
            return { [key]: !val };
          }
          return {};
        }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'typing-app-settings',
    }
  )
);

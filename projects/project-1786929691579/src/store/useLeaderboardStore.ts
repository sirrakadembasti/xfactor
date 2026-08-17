import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LeaderboardEntry {
  id: string;
  username: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  testMode: string;
  duration: number;
  date: string;
}

interface LeaderboardState {
  entries: LeaderboardEntry[];
  addEntry: (entry: Omit<LeaderboardEntry, 'id' | 'date'>) => void;
  clearLeaderboard: () => void;
  getTopScores: (limit?: number, mode?: string) => LeaderboardEntry[];
}

const initialEntries: LeaderboardEntry[] = [
  {
    id: '1',
    username: 'SpeedDemon',
    wpm: 128,
    rawWpm: 135,
    accuracy: 98.2,
    consistency: 94,
    testMode: 'time-30',
    duration: 30,
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: '2',
    username: 'KeyboardNinja',
    wpm: 112,
    rawWpm: 118,
    accuracy: 96.5,
    consistency: 91,
    testMode: 'time-30',
    duration: 30,
    date: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: '3',
    username: 'TypeMaster',
    wpm: 105,
    rawWpm: 110,
    accuracy: 97.8,
    consistency: 95,
    testMode: 'words-50',
    duration: 45,
    date: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

export const useLeaderboardStore = create<LeaderboardState>()(
  persist(
    (set, get) => ({
      entries: initialEntries,
      addEntry: (entry) => {
        const newEntry: LeaderboardEntry = {
          ...entry,
          id: Math.random().toString(36).substring(2, 9),
          date: new Date().toISOString(),
        };
        set((state) => ({
          entries: [newEntry, ...state.entries].sort((a, b) => b.wpm - a.wpm),
        }));
      },
      clearLeaderboard: () => set({ entries: [] }),
      getTopScores: (limit = 10, mode) => {
        const { entries } = get();
        let filtered = [...entries];
        if (mode) {
          filtered = filtered.filter((e) => e.testMode === mode);
        }
        return filtered.sort((a, b) => b.wpm - a.wpm).slice(0, limit);
      },
    }),
    {
      name: 'typing-app-leaderboard',
    }
  )
);

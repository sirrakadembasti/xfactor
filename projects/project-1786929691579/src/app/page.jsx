import React, { useState } from 'react';
import {
  Brain,
  Scissors,
  Grid3X3,
  Flame,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  RotateCcw,
  Home,
  Gamepad2
} from 'lucide-react';

import XoxGame from '../components/games/XoxGame';
import RockPaperScissorsGame from '../components/games/RockPaperScissors/RockPaperScissorsGame';
import Wordle from '../components/Wordle/Wordle';
import GameBoard from '../components/SnakeGame/GameBoard';
import MemoryGame from '../components/games/MemoryGame/MemoryGame';
import LeaderboardTable from '../components/leaderboard/LeaderboardTable';

export default function GamesHubPage() {
  const [activeGame, setActiveGame] = useState('hub'); // 'hub' | 'hafiza' | 'tkm' | 'xox' | 'snake' | 'wordle' | 'leaderboard'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const games = [
    {
      id: 'hafiza',
      title: '🧠 Hafıza Kartları',
      description: 'Görsel ve ikonları eşleştirin, hamle ve süre rekoru kırın.',
      badge: 'Zeka & Dikkat',
      color: 'from-purple-500 to-indigo-600',
      bgColor: 'bg-purple-50 hover:bg-purple-100 border-purple-200'
    },
    {
      id: 'tkm',
      title: '✂️ Taş - Kağıt - Makas',
      description: 'Bilgisayara karşı stratejik seri maçlar yapın ve serinizi koruyun.',
      badge: 'Refleks & Taktik',
      color: 'from-amber-500 to-orange-600',
      bgColor: 'bg-amber-50 hover:bg-amber-100 border-amber-200'
    },
    {
      id: 'xox',
      title: '❌ XOX (Tic-Tac-Toe)',
      description: 'Yapay Zekaya karşı (Kolay/Zor) veya 2 kişilik oynayın.',
      badge: 'Klasik Strateji',
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200'
    },
    {
      id: 'snake',
      title: '🐍 Yılan Oyunu (Snake)',
      description: 'Yemi toplayın, kuyruğa çarpmadan en yüksek skora ulaşın.',
      badge: 'Arcade Hız',
      color: 'from-emerald-500 to-green-600',
      bgColor: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
    },
    {
      id: 'wordle',
      title: '🔤 Türkçe Wordle (Kelime)',
      description: '5 harfli gizli Türkçe kelimeyi 6 denemede tahmin edin.',
      badge: 'Kelime Hazinesi',
      color: 'from-rose-500 to-pink-600',
      bgColor: 'bg-rose-50 hover:bg-rose-100 border-rose-200'
    }
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Üst Navigasyon Çubuğu */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md px-6 py-3.5 flex items-center justify-between shadow-sm ${
        darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'
      }`}>
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveGame('hub')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md">
            <Gamepad2 size={24} />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Küçük Oyunlar Portalı
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">5'i 1 Arada Türkçe Mini Oyun Paketi</p>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex items-center gap-2.5">
          {activeGame !== 'hub' && (
            <button
              onClick={() => setActiveGame('hub')}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center gap-1.5 transition"
            >
              <Home size={15} /> Ana Menü
            </button>
          )}

          <button
            onClick={() => setActiveGame('leaderboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
              activeGame === 'leaderboard'
                ? 'bg-amber-500 text-white shadow-md'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <Trophy size={15} /> Liderlik Tablosu
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg text-xs font-bold transition border ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg text-xs font-bold transition border ${
              darkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Temayı Değiştir"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Ana Gövde */}
      <main className="max-w-6xl mx-auto p-6 md:p-8">
        
        {/* HUB / OYUN SEÇİM MENÜSÜ */}
        {activeGame === 'hub' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Banner */}
            <div className="rounded-2xl p-8 bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-md mb-3">
                  <Sparkles size={14} className="text-amber-300" /> %100 Türkçe Oyunlar
                </span>
                <h2 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">
                  Eğlenceye Hazır Mısın?
                </h2>
                <p className="text-indigo-100 text-sm leading-relaxed mb-6">
                  Hafıza kartlarından kelime tahminine, klasik XOX'ten yılan oyununa kadar 5 farklı oyunda rekorlarını kır ve liderlik tablosunda yerini al!
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setActiveGame('hafiza')}
                    className="bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
                  >
                    Hemen Oyna
                  </button>
                  <button
                    onClick={() => setActiveGame('leaderboard')}
                    className="bg-indigo-800/80 hover:bg-indigo-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm border border-indigo-400/30 transition"
                  >
                    Skorları Gör
                  </button>
                </div>
              </div>
            </div>

            {/* Oyun Kartları Grid */}
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Gamepad2 size={20} className="text-indigo-600" /> Oyun Seçimi
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {games.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => setActiveGame(g.id)}
                    className={`rounded-2xl p-6 border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between ${
                      darkMode ? 'bg-slate-900 border-slate-800 hover:border-indigo-500' : `${g.bgColor}`
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/80 text-slate-700 border shadow-xs">
                          {g.badge}
                        </span>
                      </div>
                      <h4 className="text-xl font-extrabold mb-2 tracking-tight">{g.title}</h4>
                      <p className={`text-xs leading-relaxed mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {g.description}
                      </p>
                    </div>
                    <button
                      className={`w-full py-2.5 rounded-xl text-white font-bold text-xs bg-gradient-to-r ${g.color} shadow-md hover:opacity-95 transition`}
                    >
                      Oyunu Başlat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 1. HAFIZA OYUNU */}
        {activeGame === 'hafiza' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">🧠 Hafıza Kartları Oyunu</h2>
              <button onClick={() => setActiveGame('hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                ← Oyun Seçimine Dön
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm">
              <MemoryGame />
            </div>
          </div>
        )}

        {/* 2. TAŞ - KAĞIT - MAKAS */}
        {activeGame === 'tkm' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">✂️ Taş - Kağıt - Makas</h2>
              <button onClick={() => setActiveGame('hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                ← Oyun Seçimine Dön
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm">
              <RockPaperScissorsGame />
            </div>
          </div>
        )}

        {/* 3. XOX OYUNU */}
        {activeGame === 'xox' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">❌ XOX (Tic-Tac-Toe)</h2>
              <button onClick={() => setActiveGame('hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                ← Oyun Seçimine Dön
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm">
              <XoxGame />
            </div>
          </div>
        )}

        {/* 4. YILAN OYUNU */}
        {activeGame === 'snake' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">🐍 Klasik Yılan Oyunu (Snake)</h2>
              <button onClick={() => setActiveGame('hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                ← Oyun Seçimine Dön
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm flex justify-center">
              <GameBoard />
            </div>
          </div>
        )}

        {/* 5. TÜRKÇE WORDLE */}
        {activeGame === 'wordle' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">🔤 Türkçe Kelime Tahmin (Wordle)</h2>
              <button onClick={() => setActiveGame('hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                ← Oyun Seçimine Dön
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm">
              <Wordle />
            </div>
          </div>
        )}

        {/* LİDERLİK TABLOSU */}
        {activeGame === 'leaderboard' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black flex items-center gap-2">
                <Trophy size={24} className="text-amber-500" /> Genel Liderlik Tablosu
              </h2>
              <button onClick={() => setActiveGame('hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                ← Ana Menüye Dön
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm">
              <LeaderboardTable />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

import React from 'react';
import { Trophy, Play, Gamepad2, Sparkles, Flame } from 'lucide-react';
import LeaderboardTable from '../components/leaderboard/LeaderboardTable';

export default function HomePage({ onNavigate, user }) {
  const games = [
    { id: 'hafiza', title: '🧠 Hafıza Kartları', desc: 'Görsel ve ikon eşleştirme oyunu' },
    { id: 'tkm', title: '✂️ Taş-Kağıt-Makas', desc: 'Seri korumalı strateji maçı' },
    { id: 'xox', title: '❌ XOX (Tic-Tac-Toe)', desc: 'AI veya 2 kişilik mod' },
    { id: 'snake', title: '🐍 Yılan Oyunu', desc: 'Klasik arcade deneyimi' },
    { id: 'wordle', title: '🔤 Türkçe Wordle', desc: '5 harfli kelime tahmini' }
  ];

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-8 text-white shadow-xl">
        <h1 className="text-3xl font-black mb-2">Küçük Oyunlar Portalı</h1>
        <p className="text-indigo-100 text-sm mb-6">5 harika Türkçe mini oyunla eğlenin ve liderlik tablosuna adınızı yazdırın!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {games.map(g => (
          <div
            key={g.id}
            onClick={() => onNavigate?.(g.id)}
            className="bg-white p-6 rounded-2xl border border-slate-200 hover:shadow-lg transition cursor-pointer"
          >
            <h3 className="font-extrabold text-lg mb-1">{g.title}</h3>
            <p className="text-xs text-slate-500 mb-4">{g.desc}</p>
            <button className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline">
              <Play size={13} /> Oyunu Oyna
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy size={20} className="text-amber-500" /> Liderlik Tablosu
        </h2>
        <LeaderboardTable />
      </div>
    </div>
  );
}

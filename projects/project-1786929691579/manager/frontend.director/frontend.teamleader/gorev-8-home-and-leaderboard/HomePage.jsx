import React, { useEffect, useState } from 'react';
import HeroSection from '../components/home/HeroSection';
import DailyChallengeCard from '../components/home/DailyChallengeCard';
import { fetchHomeStats, fetchLeaderboard } from '../services/leaderboardService';
import { Users, CheckCircle2, Flame, Trophy, ArrowRight, Sparkles } from 'lucide-react';

export default function HomePage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [topUsers, setTopUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsData, leaderboardData] = await Promise.all([
          fetchHomeStats(),
          fetchLeaderboard('all-time')
        ]);
        setStats(statsData);
        setTopUsers(leaderboardData.slice(0, 5));
      } catch (err) {
        console.error('Veri yüklenirken hata oluştu:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Hero Alanı */}
      <HeroSection
        onStartQuiz={() => onNavigate && onNavigate('quiz')}
        onViewLeaderboard={() => onNavigate && onNavigate('leaderboard')}
      />

      {/* İstatistik Çubukları */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Toplam Oyuncu</div>
              <div className="text-xl font-extrabold text-white">{stats.totalPlayers.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Çözülen Quiz</div>
              <div className="text-xl font-extrabold text-white">{stats.quizzesCompleted.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Aktif Seriler</div>
              <div className="text-xl font-extrabold text-white">{stats.activeStreaks.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Günün Ödülü</div>
              <div className="text-xl font-extrabold text-amber-400">+{stats.dailyChallengeXP} XP</div>
            </div>
          </div>
        </div>
      )}

      {/* Ana İçerik Izgarası */}
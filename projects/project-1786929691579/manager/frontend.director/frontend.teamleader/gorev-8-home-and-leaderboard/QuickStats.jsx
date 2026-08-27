import React from 'react';
import { Trophy, Flame, Zap, Award } from 'lucide-react';

export default function QuickStats({ stats }) {
  const statItems = [
    {
      label: 'Toplam XP',
      value: stats?.currentXP?.toLocaleString() || '0',
      subtext: `Seviye ${stats?.level || 1}`,
      icon: Zap,
      color: 'from-amber-500 to-yellow-400',
      bgColor: 'bg-amber-500/10',
      textColor: 'text-amber-500'
    },
    {
      label: 'Dünya Sıralaması',
      value: `#${stats?.globalRank || '-'}`,
      subtext: 'İlk %5 içerisindesiniz',
      icon: Trophy,
      color: 'from-indigo-500 to-purple-500',
      bgColor: 'bg-indigo-500/10',
      textColor: 'text-indigo-500'
    },
    {
      label: 'Günlük Seri',
      value: `${stats?.streakDays || 0} Gün`,
      subtext: 'Harika bir seri!',
      icon: Flame,
      color: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-500/10',
      textColor: 'text-orange-500'
    },
    {
      label: 'Çözülen Görevler',
      value: stats?.solvedTasks || '0',
      subtext: `${stats?.totalBadges || 0} Rozet Kazanıldı`,
      icon: Award,
      color: 'from-emerald-500 to-teal-400',
      bgColor: 'bg-emerald-500/10',
      textColor: 'text-emerald-500'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
      {statItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <div 
            key={index} 
            className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-md flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{item.label}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{item.value}</h3>
              <p className="text-xs text-slate-400 mt-1">{item.subtext}</p>
            </div>
            <div className={`p-3.5 rounded-xl ${item.bgColor} ${item.textColor}`}>
              <Icon className="w-6 h-6" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

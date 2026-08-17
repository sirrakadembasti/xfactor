import React from 'react';
import { Clock, CheckCircle2, Award, Zap } from 'lucide-react';

export default function RecentActivity({ activities = [] }) {
  const getIcon = (type) => {
    switch (type) {
      case 'badge':
        return <Award className="w-4 h-4 text-amber-400" />;
      case 'challenge':
        return <Zap className="w-4 h-4 text-indigo-400" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          Son Aktiviteler
        </h2>
      </div>

      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">Henüz aktivite bulunmuyor.</p>
        ) : (
          activities.map((act) => (
            <div 
              key={act.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-800/80 hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                  {getIcon(act.type)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{act.title}</p>
                  <p className="text-xs text-slate-400">{act.time}</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                {act.xp}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

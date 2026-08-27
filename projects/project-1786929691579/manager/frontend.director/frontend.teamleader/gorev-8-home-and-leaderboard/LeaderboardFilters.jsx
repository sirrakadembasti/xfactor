import React from 'react';
import { Calendar, Filter } from 'lucide-react';

export default function LeaderboardFilters({
  timeframe,
  setTimeframe,
  category,
  setCategory
}) {
  const timeframes = [
    { id: 'daily', label: 'Günlük' },
    { id: 'weekly', label: 'Haftalık' },
    { id: 'alltime', label: 'Tüm Zamanlar' }
  ];

  const categories = [
    { id: 'all', label: 'Tüm Kategoriler' },
    { id: 'Frontend', label: 'Frontend' },
    { id: 'Backend', label: 'Backend' },
    { id: 'Fullstack', label: 'Fullstack' },
    { id: 'Mobile', label: 'Mobile' }
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl mb-6">
      {/* Timeframe Selector */}
      <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
        {timeframes.map((tf) => (
          <button
            key={tf.id}
            onClick={() => setTimeframe(tf.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${' + 
              timeframe === tf.id
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* Category Dropdown */}
      <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-2"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id} className="bg-slate-900 text-slate-200">
              {cat.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

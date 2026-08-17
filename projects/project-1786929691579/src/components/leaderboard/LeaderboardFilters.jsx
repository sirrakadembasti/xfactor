import React from 'react';
import { Search, Filter } from 'lucide-react';

export default function LeaderboardFilters({
  searchQuery,
  setSearchQuery,
  timeframe,
  setTimeframe,
  category,
  setCategory,
  categories = []
}) {
  const timeframes = [
    { id: 'daily', label: 'Günlük' },
    { id: 'weekly', label: 'Haftalık' },
    { id: 'monthly', label: 'Aylık' },
    { id: 'all', label: 'Tüm Zamanlar' }
  ];

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-4 space-y-4 mb-6 shadow-lg">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kullanıcı ara..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900/70 border border-slate-700/80 rounded-lg text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Timeframe Selector Buttons */}
        <div className="flex items-center bg-slate-900/70 p-1 border border-slate-700/80 rounded-lg w-full md:w-auto overflow-x-auto">
          {timeframes.map((tf) => {
            const isActive = timeframe === tf.id;
            return (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        {/* Category Dropdown */}
        {categories.length > 0 && (
          <div className="relative w-full md:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-900/70 border border-slate-700/80 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors appearance-none cursor-pointer"
            >
              <option value="all">Tüm Kategoriler</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

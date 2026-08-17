import React from 'react';
import { X, Award, Flame, CheckCircle, BarChart2 } from 'lucide-react';

export default function StatsModal({ isOpen, onClose, stats, solution, isGameOver, onNewGame }) {
  if (!isOpen) return null;

  const winPercentage = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDistribution = Math.max(...Object.values(stats.distribution), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800 dark:text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-black text-center mb-6 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
          <BarChart2 className="w-7 h-7" /> İSTATİSTİKLER
        </h2>

        <div className="grid grid-cols-4 gap-2 text-center mb-6">
          <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.played}
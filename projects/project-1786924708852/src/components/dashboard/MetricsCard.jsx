'use client';

import React from 'react';

export default function MetricsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendType = 'up', // 'up' | 'down' | 'neutral'
  badgeText,
  color = 'blue', // 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'indigo'
  onClick,
}) {
  const colorStyles = {
    blue: {
      border: 'border-blue-500/20 hover:border-blue-500/40',
      iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
      badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/40',
      iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
      badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    },
    indigo: {
      border: 'border-indigo-500/20 hover:border-indigo-500/40',
      iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
      badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    },
  };

  const currentStyle = colorStyles[color] || colorStyles.blue;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-sm transition-all duration-200 ${
        currentStyle.border
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${currentStyle.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {value}
        </div>
        {badgeText && (
          <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${currentStyle.badge}`}>
            {badgeText}
          </span>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 flex items-center text-xs font-medium text-slate-500 dark:text-slate-400">
          {trend && (
            <span
              className={`mr-1.5 flex items-center ${
                trendType === 'up'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : trendType === 'down'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500'
              }`}
            >
              {trend}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

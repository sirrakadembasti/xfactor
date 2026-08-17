import React from 'react';
import { Flame, TrendingUp, TrendingDown, Minus, Award } from 'lucide-react';

export default function LeaderboardTable({ users = [], currentUser = null }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-4 px-4 text-center w-16">Sıra</th>
              <th className="py-4 px-4">Oyuncu</th>
              <th className="py-4 px-4 text-center hidden sm:table-cell">Seviye</th>
              <th className="py-4 px-4 text-center hidden md:table-cell">Seri</th>
              <th className="py-4 px-4 text-right">Toplam XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-sm">
            {users.map((user) => {
              const isCurrent = currentUser && currentUser.id === user.id;
              return (
                <tr
                  key={user.id}
                  className={`transition-colors hover:bg-slate-800/50 ${'bg-indigo-950/30 border-l-4 border-l-indigo-500'}`}
                >
                  {/* Sıra */}
                  <td className="py-3.5 px-4 text-center font-extrabold text-slate-300">
                    <div className="flex items-center justify-center gap-1">
                      {user.rank <= 3 ? (
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                            user.rank === 1
                              ? 'bg-amber-400 text-slate-950'
                              : user.rank === 2
                              ? 'bg-slate-300 text-slate-950'
                              : 'bg-amber-700 text-white'
                          }`}
                        >
                          {user.rank}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-semibold">#{user.rank}</span>
                      )}
                    </div>
                  </td>

                  {/* Kullanıcı Profili */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-700/60"
                      />
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{user.name}</span>
                          {user.badge && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                              {user.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">@{user.username}</div>
                      </div>
                    </div>
                  </td>

                  {/* Seviye */}
                  <td className="py-3.5 px-4 text-center hidden sm:table-cell">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-xs">
                      Lvl {user.level}
                    </span>
                  </td>

                  {/* Seri */}
                  <td className="py-3.5 px-4 text-center hidden md:table-cell">
                    <div className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                      <span>{user.streak} Gün</span>
                    </div>
                  </td>

                  {/* Toplam XP */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="font-black text-amber-400 text-sm md:text-base">
                      {user.xp.toLocaleString()} <span className="text-xs font-normal text-slate-400">XP</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

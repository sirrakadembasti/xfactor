// Mock Leaderboard & Home Service

const MOCK_LEADERBOARD = [
  {
    id: '1',
    username: 'YazılımGurusu',
    name: 'Ahmet Yılmaz',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    xp: 14250,
    level: 28,
    gamesPlayed: 142,
    winRate: 88,
    streak: 14,
    rank: 1,
    trend: 'up',
    badge: '👑 Şampiyon'
  },
  {
    id: '2',
    username: 'KodKraliçesi',
    name: 'Zeynep Kaya',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    xp: 12800,
    level: 25,
    gamesPlayed: 120,
    winRate: 85,
    streak: 9,
    rank: 2,
    trend: 'same',
    badge: '⚡ Hız Ustası'
  },
  {
    id: '3',
    username: 'BugAvcısı',
    name: 'Mehmet Demir',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
    xp: 11400,
    level: 23,
    gamesPlayed: 105,
    winRate: 81,
    streak: 7,
    rank: 3,
    trend: 'up',
    badge: '🎯 Keskin Göz'
  },
  {
    id: '4',
    username: 'FrontendNinja',
    name: 'Elif Şahin',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    xp: 9850,
    level: 20,
    gamesPlayed: 94,
    winRate: 78,
    streak: 5,
    rank: 4,
    trend: 'down',
    badge: '🎨 Tasarım Ustası'
  },
  {
    id: '5',
    username: 'DevOpsPro',
    name: 'Can Çelik',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    xp: 8900,
    level: 18,
    gamesPlayed: 82,
    winRate: 74,
    streak: 4,
    rank: 5,
    trend: 'up',
    badge: '🛡️ Sistem Mimarı'
  },
  {
    id: '6',
    username: 'AlgoMaster',
    name: 'Burak Öztürk',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    xp: 8150,
    level: 17,
    gamesPlayed: 76,
    winRate: 72,
    streak: 3,
    rank: 6,
    trend: 'down',
    badge: '🧠 Mantık Dehası'
  },
  {
    id: '7',
    username: 'ReactMaster',
    name: 'Seda Aydın',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    xp: 7600,
    level: 15,
    gamesPlayed: 68,
    winRate: 70,
    streak: 2,
    rank: 7,
    trend: 'same',
    badge: '⚛️ Component Uzmanı'
  }
];

export const CURRENT_USER = {
  id: 'user-curr',
  username: 'Siz',
  name: 'Geliştirici Kullanıcı',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  xp: 4250,
  level: 9,
  gamesPlayed: 34,
  winRate: 65,
  streak: 3,
  rank: 18,
  trend: 'up'
};

export const fetchLeaderboard = async (period = 'all-time', category = 'all') => {
  // Simüle edilmiş API gecikmesi
  await new Promise((resolve) => setTimeout(resolve, 300));
  
  let data = [...MOCK_LEADERBOARD];
  if (period === 'weekly') {
    data = data.map((item) => ({ ...item, xp: Math.round(item.xp * 0.25) }));
  } else if (period === 'monthly') {
    data = data.map((item) => ({ ...item, xp: Math.round(item.xp * 0.6) }));
  }
  
  return data.sort((a, b) => b.xp - a.xp);
};

export const fetchHomeStats = async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return {
    totalPlayers: 12450,
    quizzesCompleted: 89300,
    activeStreaks: 1420,
    dailyChallengeXP: 500
  };
};

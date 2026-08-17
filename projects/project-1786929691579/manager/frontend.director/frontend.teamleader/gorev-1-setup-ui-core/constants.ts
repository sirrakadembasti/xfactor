export const APP_NAME = 'Yönetim Paneli';
export const APP_DESCRIPTION = 'Modern ve modüler yönetim sistemi altyapısı.';

export const NAV_ITEMS = [
  { label: 'Ana Sayfa', href: '/', icon: 'Home' },
  { label: 'Görevler', href: '/tasks', icon: 'CheckSquare' },
  { label: 'Kullanıcılar', href: '/users', icon: 'Users' },
  { label: 'Ayarlar', href: '/settings', icon: 'Settings' },
] as const;

export const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
} as const;

export const DEFAULT_PAGE_SIZE = 10;

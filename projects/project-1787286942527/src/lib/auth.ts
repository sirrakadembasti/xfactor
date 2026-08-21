export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Simüle edilmiş aktif oturum kullanıcısı (NextAuth / JWT uyumlu)
  return {
    id: 'user-teacher-1',
    name: 'Öğr. Selim Kaya',
    email: 'selim@okul.edu.tr',
    role: 'TEACHER'
  };
}

export async function requireAuth(roles: Array<'ADMIN' | 'TEACHER' | 'STUDENT'> = []): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Yetkilendirme gerekli');
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new Error('Bu işlem için yetkiniz bulunmamaktadır');
  }
  return user;
}

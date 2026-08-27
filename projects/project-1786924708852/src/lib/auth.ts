import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface User {
    id: string;
    role: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}

/**
 * Parola şifreleme yardımcı fonksiyonu
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

/**
 * Parola doğrulama yardımcı fonksiyonu
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

/**
 * NextAuth Yapılandırması
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 gün
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("E-posta adresi ve şifre zorunludur.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("Kullanıcı bulunamadı veya geçersiz kimlik bilgileri.");
        }

        if (user.isActive === false) {
          throw new Error("Hesabınız pasif durumdadır. Lütfen yönetici ile iletişime geçin.");
        }

        const isValid = await verifyPassword(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Geçersiz şifre girdiniz.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      if (trigger === "update" && session) {
        token = { ...token, ...session };
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Sunucu tarafında mevcut oturumu getirir
 */
export async function getAuthSession() {
  return await getServerSession(authOptions);
}

/**
 * Sunucu tarafında mevcut oturum açmış kullanıcıyı getirir
 */
export async function getCurrentUser() {
  const session = await getAuthSession();
  return session?.user ?? null;
}

/**
 * Rol Kontrolü (RBAC)
 */
export async function checkRole(allowedRoles: string[]): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !user.role) return false;
  return allowedRoles.includes(user.role);
}

export async function isAdmin(): Promise<boolean> {
  return await checkRole(["ADMIN"]);
}

export async function isTeacher(): Promise<boolean> {
  return await checkRole(["TEACHER", "ADMIN"]);
}

/**
 * Zorunlu Rol Doğrulamaları (Yetkisiz erişimde hata fırlatır)
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Bu işlem için Yetkili (Admin) rolü gereklidir.");
  }
  return user;
}

export async function requireTeacher() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "TEACHER" && user.role !== "ADMIN")) {
    throw new Error("Bu işlem için Öğretmen veya Admin rolü gereklidir.");
  }
  return user;
}

import { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Giriş Yap | Rent a Car",
  description: "Hesabınıza giriş yaparak rezervasyonlarınızı ve kiralama işlemlerinizi yönetin.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Tekrar Hoş Geldiniz
          </h1>
          <p className="text-sm text-muted-foreground">
            Hesabınıza erişmek için e-posta ve şifrenizi giriniz
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <LoginForm />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Hesabınız yok mu?{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Kayıt Olun
          </Link>
        </p>
      </div>
    </div>
  );
}

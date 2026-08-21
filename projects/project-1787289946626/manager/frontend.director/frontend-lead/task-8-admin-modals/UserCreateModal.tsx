"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { X, UserPlus, User, Mail, Lock, ShieldCheck, Loader2 } from "lucide-react";

const createUserAdminSchema = z
  .object({
    name: z
      .string()
      .min(1, "Ad Soyad alanı zorunludur.")
      .min(2, "Ad Soyad en az 2 karakter olmalıdır.")
      .max(100, "Ad Soyad en fazla 100 karakter olabilir."),
    email: z
      .string()
      .min(1, "E-posta adresi zorunludur.")
      .email("Geçerli bir e-posta adresi giriniz."),
    password: z
      .string()
      .min(1, "Şifre zorunludur.")
      .min(6, "Şifre en az 6 karakter olmalıdır.")
      .max(100, "Şifre en fazla 100 karakter olabilir."),
    confirmPassword: z.string().min(1, "Şifre onayı zorunludur."),
    role: z.enum(["STUDENT", "TEACHER", "ADMIN"]).default("STUDENT"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

type CreateUserInput = z.infer<typeof createUserAdminSchema>;

interface UserCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UserCreateModal({
  isOpen,
  onClose,
  onSuccess,
}: UserCreateModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserAdminSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "STUDENT",
    },
  });

  const onSubmit = async (data: CreateUserInput) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          confirmPassword: data.confirmPassword,
          role: data.role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Kullanıcı kaydı oluşturulamadı.");
      }

      toast.success("Kullanıcı hesabı başarıyla oluşturuldu!");
      reset();
      onClose();
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Bir hata meydana geldi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Yeni Kullanıcı Ekle
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sisteme yeni bir öğrenci, eğitmen veya yönetici tanımlayın.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
          {/* Ad Soyad */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Ad Soyad *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Örn: Ahmet Yılmaz"
                className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50 ${
                  errors.name ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
                {...register("name")}
              />
            </div>
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* E-posta */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              E-Posta Adresi *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                placeholder="ahmet@universite.edu.tr"
                className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50 ${
                  errors.email ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Rol Seçimi */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Kullanıcı Rolü *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <select
                className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50 ${
                  errors.role ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
                {...register("role")}
              >
                <option value="STUDENT">Öğrenci</option>
                <option value="TEACHER">Eğitmen / Öğretmen</option>
                <option value="ADMIN">Yönetici (Admin)</option>
              </select>
            </div>
            {errors.role && (
              <p className="mt-1 text-xs text-red-500">{errors.role.message}</p>
            )}
          </div>

          {/* Şifre ve Onay */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Şifre *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  placeholder="••••••"
                  className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50 ${
                    errors.password ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                  }`}
                  {...register("password")}
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Şifre Onayı *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  placeholder="••••••"
                  className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50 ${
                    errors.confirmPassword ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                  }`}
                  {...register("confirmPassword")}
                />
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          {/* Butonlar */}
          <div className="mt-6 flex items-center justify-end space-x-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Oluşturuluyor...
                </>
              ) : (
                "Kullanıcı Ekle"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { X, BookOpen, Hash, AlignLeft, UserCheck, Loader2 } from "lucide-react";
import { SafeUser } from "@/types";

const createClassSchema = z.object({
  title: z
    .string()
    .min(1, "Ders adı zorunludur.")
    .min(3, "Ders adı en az 3 karakter olmalıdır.")
    .max(100, "Ders adı en fazla 100 karakter olabilir."),
  code: z
    .string()
    .min(1, "Ders kodu zorunludur.")
    .min(2, "Ders kodu en az 2 karakter olmalıdır.")
    .max(20, "Ders kodu en fazla 20 karakter olabilir.")
    .transform((val) => val.toUpperCase().trim()),
  description: z.string().max(500, "Açıklama 500 karakterden uzun olamaz.").optional().nullable(),
  teacherId: z.string().min(1, "Lütfen bir eğitmen seçiniz."),
});

type CreateClassInput = z.infer<typeof createClassSchema>;

interface ClassCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  teachers?: SafeUser[];
}

export function ClassCreateModal({
  isOpen,
  onClose,
  onSuccess,
  teachers: initialTeachers,
}: ClassCreateModalProps) {
  const [teachers, setTeachers] = useState<SafeUser[]>(initialTeachers || []);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClassInput>({
    resolver: zodResolver(createClassSchema),
    defaultValues: {
      title: "",
      code: "",
      description: "",
      teacherId: "",
    },
  });

  useEffect(() => {
    if (isOpen && (!initialTeachers || initialTeachers.length === 0)) {
      const fetchTeachers = async () => {
        setIsLoadingTeachers(true);
        try {
          const response = await fetch("/api/users?role=TEACHER");
          if (response.ok) {
            const data = await response.json();
            setTeachers(data);
          }
        } catch (error) {
          console.error("Eğitmenler yüklenemedi:", error);
        } finally {
          setIsLoadingTeachers(false);
        }
      };
      fetchTeachers();
    } else if (initialTeachers) {
      setTeachers(initialTeachers);
    }
  }, [isOpen, initialTeachers]);

  const onSubmit = async (data: CreateClassInput) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Sınıf oluşturulurken bir hata oluştu.");
      }

      toast.success("Sınıf başarıyla oluşturuldu!");
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
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Yeni Sınıf / Ders Oluştur
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sisteme yeni bir eğitim dersi ve sorumlu eğitmen tanımlayın.
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
          {/* Ders Başlığı */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Ders Adı *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <BookOpen className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Örn: İleri Düzey Web Programlama"
                className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/50 ${
                  errors.title ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
                {...register("title")}
              />
            </div>
            {errors.title && (
              <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Ders Kodu & Eğitmen Seçimi */} 
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Ders Kodu *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Hash className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="Örn: CS101"
                  className={`w-full uppercase rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/50 ${
                    errors.code ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                  }`}
                  {...register("code")}
                />
              </div>
              {errors.code && (
                <p className="mt-1 text-xs text-red-500">{errors.code.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Sorumlu Eğitmen *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <UserCheck className="h-4 w-4" />
                </div>
                <select
                  disabled={isLoadingTeachers}
                  className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/50 ${
                    errors.teacherId ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                  }`}
                  {...register("teacherId")}
                >
                  <option value="">{isLoadingTeachers ? "Yükleniyor..." : "Eğitmen Seçiniz"}</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name} ({teacher.email})
                    </option>
                  ))}
                </select>
              </div>
              {errors.teacherId && (
                <p className="mt-1 text-xs text-red-500">{errors.teacherId.message}</p>
              )}
            </div>
          </div>

          {/* Ders Açıklaması */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Açıklama
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute top-3 left-3 text-slate-400">
                <AlignLeft className="h-4 w-4" />
              </div>
              <textarea
                rows={3}
                placeholder="Ders içeriği hakkında kısa bilgi..."
                className={`w-full rounded-lg border bg-slate-50 pl-10 pr-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/50 ${
                  errors.description ? "border-red-500 dark:border-red-500" : "border-slate-200 dark:border-slate-700"
                }`}
                {...register("description")}
              />
            </div>
            {errors.description && (
              <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
            )}
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
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                "Sınıfı Oluştur"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

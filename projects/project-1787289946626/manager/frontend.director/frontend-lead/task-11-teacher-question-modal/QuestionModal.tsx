"use client";

import React, { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  HelpCircle,
  Check,
  Layers,
  Award,
  AlignLeft,
} from "lucide-react";
import { questionSchema, type QuestionInput } from "@/lib/validations/exam";

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: QuestionInput) => void;
  initialData?: QuestionInput | null;
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuestionInput>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      text: "",
      type: "MULTIPLE_CHOICE",
      points: 10,
      options: [
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ],
      correctAnswer: "",
    },
  });

  const selectedType = watch("type");
  const options = watch("options") || [];

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "options",
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          id: initialData.id,
          text: initialData.text || "",
          type: initialData.type || "MULTIPLE_CHOICE",
          points: initialData.points || 10,
          options: initialData.options && initialData.options.length > 0
            ? initialData.options.map((opt) => ({
                id: opt.id,
                text: opt.text,
                isCorrect: Boolean(opt.isCorrect),
              }))
            : [
                { text: "", isCorrect: false },
                { text: "", isCorrect: false },
              ],
          correctAnswer: initialData.correctAnswer || "",
        });
      } else {
        reset({
          text: "",
          type: "MULTIPLE_CHOICE",
          points: 10,
          options: [
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
          ],
          correctAnswer: "",
        });
      }
    }
  }, [isOpen, initialData, reset]);

  const handleTypeChange = (newType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN_ENDED") => {
    setValue("type", newType);
    if (newType === "TRUE_FALSE") {
      replace([
        { text: "Doğru", isCorrect: true },
        { text: "Yanlış", isCorrect: false },
      ]);
    } else if (newType === "MULTIPLE_CHOICE") {
      if (options.length < 2) {
        replace([
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ]);
      }
    } else if (newType === "OPEN_ENDED") {
      replace([]);
    }
  };

  const handleSetCorrectOption = (targetIndex: number) => {
    const currentOptions = options.map((opt, idx) => ({
      ...opt,
      isCorrect: idx === targetIndex,
    }));
    replace(currentOptions);
  };

  const onSubmit = (data: QuestionInput) => {
    if (data.type === "MULTIPLE_CHOICE" || data.type === "TRUE_FALSE") {
      if (!data.options || data.options.length < 2) {
        toast.error("En az 2 seçenek eklemelisiniz.");
        return;
      }
      const hasCorrect = data.options.some((opt) => opt.isCorrect);
      if (!hasCorrect) {
        toast.error("Lütfen doğru seçeneği işaretleyiniz.");
        return;
      }
    }

    onSave(data);
    toast.success(initialData ? "Soru güncellendi." : "Soru eklendi.");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl transition-all">
        {/* Modal Başlığı */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {initialData ? "Soruyu Düzenle" : "Yeni Soru Ekle"}
              </h3>
              <p className="text-xs text-gray-500">
                Soru metnini, puanını ve cevap seçeneklerini belirleyin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Alanı */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Soru Tipi Seçimi */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
              Soru Tipi
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleTypeChange("MULTIPLE_CHOICE")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedType === "MULTIPLE_CHOICE"
                    ? "border-blue-600 bg-blue-50/50 text-blue-700 ring-2 ring-blue-600/20"
                    : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
                }`}
              >
                <Layers className="h-4 w-4 mb-1.5" />
                Çoktan Seçmeli
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("TRUE_FALSE")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedType === "TRUE_FALSE"
                    ? "border-blue-600 bg-blue-50/50 text-blue-700 ring-2 ring-blue-600/20"
                    : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
                }`}
              >
                <CheckCircle2 className="h-4 w-4 mb-1.5" />
                Doğru / Yanlış
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("OPEN_ENDED")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedType === "OPEN_ENDED"
                    ? "border-blue-600 bg-blue-50/50 text-blue-700 ring-2 ring-blue-600/20"
                    : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
                }`}
              >
                <AlignLeft className="h-4 w-4 mb-1.5" />
                Açık Uçlu
              </button>
            </div>
          </div>

          {/* Soru Metni & Puanı */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Soru Metni <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register("text")}
                rows={3}
                placeholder="Örn: Türkiye'nin başkenti neresidir?"
                className={`w-full rounded-xl border p-3 text-sm transition focus:outline-none focus:ring-2 ${
                  errors.text
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-gray-200 focus:border-blue-600 focus:ring-blue-100"
                }`}
              />
              {errors.text && (
                <p className="mt-1 text-xs text-red-500">{errors.text.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Puan Değeri
              </label>
              <div className="relative w-36">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Award className="h-4 w-4" />
                </div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  {...register("points")}
                  className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {errors.points && (
                <p className="mt-1 text-xs text-red-500">{errors.points.message}</p>
              )}
            </div>
          </div>

          {/* Çoktan Seçmeli & Doğru-Yanlış Seçenek Alanı */}
          {(selectedType === "MULTIPLE_CHOICE" || selectedType === "TRUE_FALSE") && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Cevap Seçenekleri
                  </label>
                  <p className="text-xs text-gray-500">
                    Doğru olan cevabın yanındaki onay butonunu işaretleyin.
                  </p>
                </div>
                {selectedType === "MULTIPLE_CHOICE" && fields.length < 6 && (
                  <button
                    type="button"
                    onClick={() => append({ text: "", isCorrect: false })}
                    className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Seçenek Ekle
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {fields.map((field, index) => {
                  const isCorrect = options[index]?.isCorrect;
                  return (
                    <div
                      key={field.id}
                      className={`flex items-center space-x-2 rounded-xl border p-2 transition-all ${
                        isCorrect
                          ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/30"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      {/* Doğru Seçenek Belirleme Butonu */}
                      <button
                        type="button"
                        title={isCorrect ? "Doğru Seçenek" : "Doğru olarak işaretle"}
                        onClick={() => handleSetCorrectOption(index)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                          isCorrect
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                            : "border-gray-300 bg-gray-50 text-gray-400 hover:border-emerald-500 hover:text-emerald-600"
                        }`}
                      >
                        <Check className="h-4 w-4 stroke-[2.5]" />
                      </button>

                      {/* Seçenek Metin Girişi */}
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder={`Seçenek ${String.fromCharCode(65 + index)}`}
                          {...register(`options.${index}.text` as const)}
                          readOnly={selectedType === "TRUE_FALSE"}
                          className={`w-full rounded-lg bg-transparent px-2.5 py-1.5 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none ${
                            selectedType === "TRUE_FALSE" ? "cursor-default" : ""
                          }`}
                        />
                      </div>

                      {/* Seçenek Silme (Çoktan seçmeli için, min 2) */}
                      {selectedType === "MULTIPLE_CHOICE" && fields.length > 2 && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Açık Uçlu Soru İpuçları/Örnek Cevap */}
          {selectedType === "OPEN_ENDED" && (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                Beklenen Doğru Cevap / Anahtar Kelimeler (İsteğe Bağlı)
              </label>
              <textarea
                {...register("correctAnswer")}
                rows={3}
                placeholder="Öğrencinin vermesi beklenen anahtar ifadeler veya model cevap..."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <p className="text-xs text-gray-500">
                Açık uçlu sorular öğretmen tarafından sınav sonrasında değerlendirilir.
              </p>
            </div>
          )}

          {/* Alt Butonlar */}
          <div className="flex items-center justify-end space-x-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {initialData ? "Değişiklikleri Kaydet" : "Soruyu Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

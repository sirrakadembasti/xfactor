"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BarChart3, TrendingUp, Award, Users, AlertCircle } from "lucide-react";

export interface ScoreDistributionItem {
  range: string;
  count: number;
  percentage: number;
}

export interface ScoreDistributionChartProps {
  title?: string;
  scores?: number[];
  customData?: ScoreDistributionItem[];
  averageScore?: number;
  highestScore?: number;
  lowestScore?: number;
  passScore?: number;
}

const DEFAULT_RANGES = [
  { min: 0, max: 19, label: "0-19" },
  { min: 20, max: 39, label: "20-39" },
  { min: 40, max: 59, label: "40-59" },
  { min: 60, max: 79, label: "60-79" },
  { min: 80, max: 89, label: "80-89" },
  { min: 90, max: 100, label: "90-100" },
];

export function ScoreDistributionChart({
  title = "Sınav Not Dağılımı ve Başarı Eğrisi",
  scores = [],
  customData,
  averageScore,
  highestScore,
  lowestScore,
  passScore = 50,
}: ScoreDistributionChartProps) {
  const chartData = useMemo(() => {
    if (customData && customData.length > 0) {
      return customData;
    }

    if (!scores || scores.length === 0) {
      return DEFAULT_RANGES.map((r) => ({
        range: r.label,
        count: 0,
        percentage: 0,
      }));
    }

    const total = scores.length;
    return DEFAULT_RANGES.map((r) => {
      const count = scores.filter((s) => s >= r.min && s <= r.max).length;
      const percentage = Math.round((count / total) * 100);
      return {
        range: r.label,
        count,
        percentage,
      };
    });
  }, [scores, customData]);

  const stats = useMemo(() => {
    if (scores && scores.length > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      const avg = Math.round((sum / scores.length) * 10) / 10;
      const max = Math.max(...scores);
      const min = Math.min(...scores);
      const passed = scores.filter((s) => s >= passScore).length;
      const passRate = Math.round((passed / scores.length) * 100);

      return {
        avg: averageScore ?? avg,
        max: highestScore ?? max,
        min: lowestScore ?? min,
        total: scores.length,
        passRate,
      };
    }

    return {
      avg: averageScore ?? 0,
      max: highestScore ?? 0,
      min: lowestScore ?? 0,
      total: customData ? customData.reduce((acc, curr) => acc + curr.count, 0) : 0,
      passRate: 0,
    };
  }, [scores, customData, averageScore, highestScore, lowestScore, passScore]);

  const isEmpty = chartData.every((item) => item.count === 0);

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Öğrenci puanlarının aralıklara göre frekans ve eğri dağılımı
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Users className="h-3.5 w-3.5 text-blue-500" />
            Katılımcı
          </div>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">
            {stats.total}
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            Ortalama Not
          </div>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">
            {stats.avg}
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Award className="h-3.5 w-3.5 text-amber-500" />
            En Yüksek / En Düşük
          </div>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">
            {stats.max} <span className="text-xs font-normal text-slate-400">/ {stats.min}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
            Geçme Oranı
          </div>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">
            %{stats.passRate}
          </p>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center dark:border-slate-800">
          <AlertCircle className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Henüz gösterilecek sınav not verisi bulunmuyor.
          </p>
          <p className="text-xs text-slate-400">
            Öğrenciler sınavı tamamladıkça dağılım grafiği otomatik güncellenir.
          </p>
        </div>
      ) : (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.2} />
              <XAxis
                dataKey="range"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "none",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(value: number, name: string) => [
                  name === "count" ? `${value} Öğrenci` : `%${value}`,
                  name === "count" ? "Öğrenci Sayısı" : "Yüzde Dağılımı",
                ]}
                labelFormatter={(label) => `Puan Aralığı: ${label}`}
              />
              <Legend
                wrapperStyle={{ paddingTop: "10px" }}
                formatter={(value) => (
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {value === "count" ? "Öğrenci Sayısı (Histogram)" : "Frekans Eğrisi (%)"}
                  </span>
                )}
              />
              <Bar
                dataKey="count"
                name="count"
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
              <Line
                type="monotone"
                dataKey="percentage"
                name="percentage"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#ffffff" }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

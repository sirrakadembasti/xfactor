"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { PieChart as PieIcon, LineChart as LineIcon, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

export interface TopicStat {
  topic: string;
  correctRate: number;
  wrongRate: number;
  emptyRate?: number;
  totalQuestions: number;
}

export interface OverallSummary {
  correct: number;
  wrong: number;
  empty: number;
}

export interface TopicPerformanceChartProps {
  title?: string;
  topicData?: TopicStat[];
  summaryData?: OverallSummary;
}

const DEFAULT_SUMMARY: OverallSummary = {
  correct: 68,
  wrong: 22,
  empty: 10,
};

const DEFAULT_TOPICS: TopicStat[] = [
  { topic: "Temel Kavramlar", correctRate: 85, wrongRate: 10, emptyRate: 5, totalQuestions: 10 },
  { topic: "Mantıksal Operatörler", correctRate: 72, wrongRate: 20, emptyRate: 8, totalQuestions: 8 },
  { topic: "Döngüler & Karar", correctRate: 64, wrongRate: 28, emptyRate: 8, totalQuestions: 12 },
  { topic: "Fonksiyonlar", correctRate: 58, wrongRate: 32, emptyRate: 10, totalQuestions: 15 },
  { topic: "Veri Yapıları", correctRate: 48, wrongRate: 38, emptyRate: 14, totalQuestions: 10 },
];

const PIE_COLORS = ["#10b981", "#ef4444", "#94a3b8"];

export function TopicPerformanceChart({
  title = "Konu ve Soru Başarı Analizi",
  topicData = DEFAULT_TOPICS,
  summaryData = DEFAULT_SUMMARY,
}: TopicPerformanceChartProps) {
  const [viewMode, setViewMode] = useState<"trend" | "breakdown">("trend");

  const totalAnswers = summaryData.correct + summaryData.wrong + summaryData.empty;
  const correctPercent = totalAnswers > 0 ? Math.round((summaryData.correct / totalAnswers) * 100) : 0;
  const wrongPercent = totalAnswers > 0 ? Math.round((summaryData.wrong / totalAnswers) * 100) : 0;
  const emptyPercent = totalAnswers > 0 ? Math.round((summaryData.empty / totalAnswers) * 100) : 0;

  const pieChartData = [
    { name: "Doğru", value: summaryData.correct, percentage: correctPercent },
    { name: "Yanlış", value: summaryData.wrong, percentage: wrongPercent },
    { name: "Boş", value: summaryData.empty, percentage: emptyPercent },
  ];

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Konu bazında başarı eğilimi ve genel cevap oranları
          </p>
        </div>

        <div className="flex items-center rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewMode("trend")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === "trend"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <LineIcon className="h-3.5 w-3.5" />
            Konu Eğilimi
          </button>
          <button
            type="button"
            onClick={() => setViewMode("breakdown")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === "breakdown"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <PieIcon className="h-3.5 w-3.5" />
            Cevap Dağılımı
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950/50 dark:bg-emerald-950/20">
          <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Doğru Oranı</p>
            <p className="text-lg font-bold text-emerald-950 dark:text-emerald-100">%{correctPercent}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 p-3 dark:border-red-950/50 dark:bg-red-950/20">
          <div className="rounded-lg bg-red-100 p-2 text-red-600 dark:bg-red-900/50 dark:text-red-400">
            <XCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-red-800 dark:text-red-300">Yanlış Oranı</p>
            <p className="text-lg font-bold text-red-950 dark:text-red-100">%{wrongPercent}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="rounded-lg bg-slate-200 p-2 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            <HelpCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Boş Oranı</p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">%{emptyPercent}</p>
          </div>
        </div>
      </div>

      {viewMode === "trend" ? (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={topicData} margin={{ top: 10, right: 15, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.2} />
              <XAxis
                dataKey="topic"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 11 }}
                angle={-15}
                textAnchor="end"
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                unit="%"
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
                  `%${value}`,
                  name === "correctRate"
                    ? "Doğru Oranı"
                    : name === "wrongRate"
                    ? "Yanlış Oranı"
                    : "Boş Oranı",
                ]}
                labelFormatter={(label) => `Konu: ${label}`}
              />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value) => (
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {value === "correctRate"
                      ? "Doğru (%)"
                      : value === "wrongRate"
                      ? "Yanlış (%)"
                      : "Boş (%)"}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="correctRate"
                name="correctRate"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#ffffff" }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="wrongRate"
                name="wrongRate"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: "#ef4444" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-72 w-full items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={4}
                dataKey="value"
              >
                {pieChartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "none",
                  borderRadius: "8px",
                  color: "#f8fafc",
                }}
                formatter={(value: number, name: string) => [
                  `${value} Cevap`,
                  name,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry: any) => (
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {value} (%{entry.payload.percentage})
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

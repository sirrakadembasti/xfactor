import React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Trophy, CheckCircle, Clock, BarChart3, AlertCircle } from "lucide-react";

export interface StudentStats {
  totalAttempts: number;
  averageScore: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalBlank: number;
  pendingQuizzesCount?: number;
}

interface StudentStatCardsProps {
  stats?: StudentStats;
}

export const StudentStatCards: React.FC<StudentStatCardsProps> = ({
  stats = {
    totalAttempts: 0,
    averageScore: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    totalBlank: 0,
    pendingQuizzesCount: 0,
  },
}) => {
  const totalQuestions = stats.totalCorrect + stats.totalIncorrect + stats.totalBlank;
  const accuracyRate = totalQuestions > 0 ? Math.round((stats.totalCorrect / totalQuestions) * 100) : 0;

  const statItems = [
    {
      id: "average-score",
      title: "Başarı Ortalaması",
      value: `%${stats.averageScore}`,
      description: "Tüm tamamlanan sınavlardan",
      icon: Trophy,
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-950/40",
    },
    {
      id: "completed-quizzes",
      title: "Tamamlanan Sınav",
      value: stats.totalAttempts.toString(),
      description: `${stats.pendingQuizzesCount || 0} bekleyen sınav var`,
      icon: CheckCircle,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      id: "accuracy-rate",
      title: "Doğruluk Oranı",
      value: `%${accuracyRate}`,
      description: `${stats.totalCorrect} doğru / ${stats.totalIncorrect} yanlış`,
      icon: BarChart3,
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/40",
    },
    {
      id: "pending-quizzes",
      title: "Çözülecek Sınavlar",
      value: (stats.pendingQuizzesCount ?? 0).toString(),
      description: "Aktif ve erişilebilir",
      icon: Clock,
      iconColor: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-50 dark:bg-indigo-950/40",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statItems.map((item) => {
        const IconComponent = item.icon;
        return (
          <Card key={item.id} className="overflow-hidden border shadow-sm transition-all hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
                  <h3 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{item.value}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </div>
                <div className={`rounded-xl p-3 ${item.bgColor}`}>
                  <IconComponent className={`h-6 w-6 ${item.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

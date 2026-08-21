import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Clock,
  HelpCircle,
  CheckCircle2,
  PlayCircle,
  FileText,
  Award,
  AlertCircle,
  Search,
  RotateCcw,
} from "lucide-react";

export interface ExamItem {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  questionCount: number;
  passingScore?: number | null;
  status: "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";
  score?: number | null;
  attemptId?: string | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date;
}

interface StudentExamListProps {
  exams: ExamItem[];
  isLoading?: boolean;
}

type FilterType = "ALL" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";

export const StudentExamList: React.FC<StudentExamListProps> = ({ exams = [], isLoading = false }) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredExams = exams.filter((exam) => {
    const matchesFilter =
      activeFilter === "ALL" ? true : exam.status === activeFilter;
    const matchesSearch =
      exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exam.description && exam.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: ExamItem["status"], score?: number | null) => {
    switch (status) {
      case "COMPLETED":
        return (
          <Badge variant="outline" className="border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            {score !== undefined && score !== null ? `Tamamlandı (%${score})` : "Tamamlandı"}
          </Badge>
        );
      case "IN_PROGRESS":
        return (
          <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Devam Ediyor
          </Badge>
        );
      case "AVAILABLE":
      default:
        return (
          <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <PlayCircle className="mr-1 h-3.5 w-3.5" />
            Yeni / Başlanmadı
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse border p-6">
              <div className="h-5 w-2/3 rounded bg-muted" />
              <div className="mt-3 h-4 w-full rounded bg-muted" />
              <div className="mt-2 h-4 w-4/5 rounded bg-muted" />
              <div className="mt-6 h-9 w-full rounded bg-muted" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtre ve Arama Alanı */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={activeFilter === "ALL" ? "default" : "outline"}
            onClick={() => setActiveFilter("ALL")}
          >
            Tümü ({exams.length})
          </Button>
          <Button
            size="sm"
            variant={activeFilter === "AVAILABLE" ? "default" : "outline"}
            onClick={() => setActiveFilter("AVAILABLE")}
          >
            Başlanabilir ({exams.filter((e) => e.status === "AVAILABLE").length})
          </Button>
          <Button
            size="sm"
            variant={activeFilter === "IN_PROGRESS" ? "default" : "outline"}
            onClick={() => setActiveFilter("IN_PROGRESS")}
          >
            Devam Eden ({exams.filter((e) => e.status === "IN_PROGRESS").length})
          </Button>
          <Button
            size="sm"
            variant={activeFilter === "COMPLETED" ? "default" : "outline"}
            onClick={() => setActiveFilter("COMPLETED")}
          >
            Tamamlanan ({exams.filter((e) => e.status === "COMPLETED").length})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Sınav ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Sınav Kartları Listesi */}
      {filteredExams.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4 text-base">Herhangi bir sınav bulunamadı</CardTitle>
          <CardDescription className="mt-1 text-sm">
            Arama kriterlerinize veya seçilen filtreye uygun bir sınav kaydı yok.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map((exam) => (
            <Card key={exam.id} className="flex flex-col justify-between border shadow-sm transition-all hover:shadow-md">
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-1 text-lg font-semibold">
                      {exam.title}
                    </CardTitle>
                    {getStatusBadge(exam.status, exam.score)}
                  </div>
                  <CardDescription className="mt-1 line-clamp-2 text-xs">
                    {exam.description || "Bu sınav için açıklama bulunmamaktadır."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-4">
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4 text-primary" />
                      <span>{exam.questionCount} Soru</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>{exam.durationMinutes ? `${exam.durationMinutes} Dakika` : "Süresiz"}</span>
                    </div>
                    {exam.passingScore !== undefined && exam.passingScore !== null && (
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Award className="h-4 w-4 text-amber-500" />
                        <span>Geçme Notu: %{exam.passingScore}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </div>

              <CardFooter className="pt-2 border-t bg-muted/20">
                {exam.status === "COMPLETED" ? (
                  <Link href={`/dashboard/results/${exam.attemptId || exam.id}`} className="w-full">
                    <Button variant="outline" className="w-full justify-center gap-2">
                      <FileText className="h-4 w-4" />
                      Sonuçları İncele
                    </Button>
                  </Link>
                ) : exam.status === "IN_PROGRESS" ? (
                  <Link href={`/quiz/${exam.id}`} className="w-full">
                    <Button variant="default" className="w-full justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white">
                      <RotateCcw className="h-4 w-4" />
                      Devam Et
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/quiz/${exam.id}`} className="w-full">
                    <Button className="w-full justify-center gap-2">
                      <PlayCircle className="h-4 w-4" />
                      Sınava Başla
                    </Button>
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

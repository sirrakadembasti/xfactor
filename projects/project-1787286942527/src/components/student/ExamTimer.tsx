"use client";

import React, { useEffect, useState, useRef } from "react";
import { Timer, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ExamTimerProps {
  durationMinutes?: number;
  initialSeconds?: number;
  warningThresholdSeconds?: number;
  onTimeUp?: () => void;
  onTick?: (remainingSeconds: number) => void;
  isPaused?: boolean;
}

export function ExamTimer({
  durationMinutes,
  initialSeconds,
  warningThresholdSeconds = 300, // Varsayılan son 5 dakika uyarı
  onTimeUp,
  onTick,
  isPaused = false,
}: ExamTimerProps) {
  const totalSeconds = initialSeconds ?? (durationMinutes ? durationMinutes * 60 : 3600);
  const [remainingTime, setRemainingTime] = useState<number>(totalSeconds);
  const onTimeUpRef = useRef(onTimeUp);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
    onTickRef.current = onTick;
  });

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onTimeUpRef.current) {
            onTimeUpRef.current();
          }
          return 0;
        }
        const nextValue = prev - 1;
        if (onTickRef.current) {
          onTickRef.current(nextValue);
        }
        return nextValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const hours = Math.floor(remainingTime / 3600);
  const minutes = Math.floor((remainingTime % 3600) / 60);
  const seconds = remainingTime % 60;

  const isWarning = remainingTime <= warningThresholdSeconds && remainingTime > 0;
  const isDanger = remainingTime <= 60 && remainingTime > 0;

  const formattedTime = [hours > 0 ? String(hours).padStart(2, "0") : null, String(minutes).padStart(2, "0"), String(seconds).padStart(2, "0")]
    .filter(Boolean)
    .join(":");

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 ${
        isDanger
          ? "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-700 dark:text-red-300 animate-pulse"
          : isWarning
          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-800 dark:text-amber-300 ring-2 ring-amber-400/20"
          : "bg-background border-border text-foreground"
      }`}
    >
      {isWarning ? (
        <AlertTriangle className={`w-4 h-4 ${isDanger ? "animate-bounce text-red-500" : "text-amber-500"}`} />
      ) : (
        <Timer className="w-4 h-4 text-muted-foreground" />
      )}

      <span className="font-mono font-bold tracking-wider text-base">
        {formattedTime}
      </span>

      {isWarning && (
        <Badge variant={isDanger ? "destructive" : "outline"} className="text-[10px] uppercase font-semibold px-1.5 py-0 h-4">
          {isDanger ? "Son 1 dk" : "Az Kaldı"}
        </Badge>
      )}
    </div>
  );
}

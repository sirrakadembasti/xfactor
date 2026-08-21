import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "gradient";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  labelFormat?: (value: number, percentage: number) => string;
  animate?: boolean;
}

const variantStyles = {
  default: "bg-indigo-600 dark:bg-indigo-500",
  success: "bg-emerald-600 dark:bg-emerald-500",
  warning: "bg-amber-500 dark:bg-amber-400",
  danger: "bg-rose-600 dark:bg-rose-500",
  info: "bg-sky-500 dark:bg-sky-400",
  gradient: "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500",
};

const sizeStyles = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value = 0,
      max = 100,
      variant = "default",
      size = "md",
      showLabel = false,
      labelFormat,
      animate = true,
      ...props
    },
    ref
  ) => {
    const safeMax = max <= 0 ? 100 : max;
    const percentage = Math.min(Math.max(Math.round((value / safeMax) * 100), 0), 100);

    const labelText = labelFormat
      ? labelFormat(value, percentage)
      : `%${percentage}`;

    return (
      <div className="w-full space-y-1" ref={ref} {...props}>
        {showLabel && (
          <div className="flex justify-between items-center text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            <span>İlerleme</span>
            <span>{labelText}</span>
          </div>
        )}
        <div
          className={cn(
            "w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800",
            sizeStyles[size],
            className
          )}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={safeMax}
        >
          <div
            className={cn(
              "h-full rounded-full",
              variantStyles[variant],
              animate && "transition-all duration-500 ease-out"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = "Progress";

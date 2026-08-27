'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}) => {
  return (
    <label
      className={cn(
        'inline-flex items-center cursor-pointer select-none gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={cn(
            'block h-6 w-11 rounded-full transition-colors',
            checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
          )}
        />
        <div
          className={cn(
            'absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform',
            checked && 'transform translate-x-5'
          )}
        />
      </div>
      {label && <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
    </label>
  );
};

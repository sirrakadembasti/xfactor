'use client';

import React from 'react';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </SessionProvider>
  );
}

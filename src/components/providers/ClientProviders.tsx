'use client';

/**
 * Client-side providers wrapper
 *
 * Wraps all client-side context providers for the application.
 * This component should be used in the root layout to provide
 * context to all pages.
 */

import React from 'react';
import { RealTimePriceProvider } from './RealTimePriceProvider';

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <RealTimePriceProvider feed="iex" autoConnect={true}>
      {children}
    </RealTimePriceProvider>
  );
}

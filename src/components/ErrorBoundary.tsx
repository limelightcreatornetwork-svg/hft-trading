'use client';

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child component tree and displays
 * a fallback UI instead of crashing the whole page.
 */

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Name to identify which section failed */
  sectionName?: string;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Compact mode for smaller sections */
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in ${this.props.sectionName || 'component'}:`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { sectionName = 'This section', showRetry = true, compact = false } = this.props;

      if (compact) {
        return (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm truncate">{sectionName} failed to load</span>
            {showRetry && (
              <button
                onClick={this.handleRetry}
                className="ml-auto text-xs hover:text-red-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        );
      }

      return (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              {sectionName} Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-400 text-sm mb-4">
              Something went wrong loading this section. This error has been logged.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="text-xs text-red-400/80 bg-zinc-900 p-2 rounded mb-4 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            {showRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleRetry}
                className="border-red-500/30 hover:bg-red-500/10"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap a component with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  sectionName?: string
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary sectionName={sectionName}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Async error boundary using React Suspense pattern
 * Use this for components that fetch data
 */
interface AsyncBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

export function AsyncBoundary({
  children,
  sectionName,
  fallback,
  loadingFallback,
}: AsyncBoundaryProps) {
  return (
    <ErrorBoundary sectionName={sectionName} fallback={fallback}>
      <React.Suspense
        fallback={
          loadingFallback || (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          )
        }
      >
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}

export default ErrorBoundary;

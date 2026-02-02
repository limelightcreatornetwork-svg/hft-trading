'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-gray-950 text-white min-h-screen flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-gray-900 border border-red-500 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-xl font-bold">Critical Error</h2>
          </div>
          
          <p className="text-gray-400">
            A critical error occurred. Please try reloading the page.
          </p>
          
          {error.message && (
            <div className="p-3 bg-red-900/30 rounded-lg">
              <p className="text-sm font-mono text-red-400">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button 
              onClick={reset}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
            >
              Try again
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

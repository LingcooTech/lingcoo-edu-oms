import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter } from 'react-router-dom';

import { AppCrashPage } from '../routes/error-pages';
import { BrandingProvider, useBranding } from '../features/branding';
import { createAppQueryClient } from './query-client';
import { ThemeModeContext } from './theme-context';

const queryClient = createAppQueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const themeMode = useMemo(
    () => ({ mode, toggle: () => setMode((current) => (current === 'light' ? 'dark' : 'light')) }),
    [mode],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <AppCrashPage error={error} onReset={resetErrorBoundary} />
      )}
    >
      <QueryClientProvider client={queryClient}>
        <BrandingProvider>
          <ThemeModeContext.Provider value={themeMode}>
            <BrandedAntDesign mode={mode}>
              <BrowserRouter basename="/admin">{children}</BrowserRouter>
            </BrandedAntDesign>
          </ThemeModeContext.Provider>
        </BrandingProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function BrandedAntDesign({ mode, children }: { mode: 'light' | 'dark'; children: ReactNode }) {
  const branding = useBranding();
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: branding.primaryColor,
          borderRadius: 8,
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}

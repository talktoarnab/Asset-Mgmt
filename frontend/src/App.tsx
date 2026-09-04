import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './AppContext';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { Button, Card } from './components/ui';
import { Icon } from './components/Icon';
import { api } from './lib/api';
import { logout, readToken } from './lib/auth';
import { useAsync } from './lib/hooks';
import type { Me } from './lib/types';
import { AssetDetail } from './pages/AssetDetail';
import { Assets } from './pages/Assets';
import { Dashboard } from './pages/Dashboard';
import { Labels } from './pages/Labels';
import { Loans } from './pages/Loans';
import { MemberDetail } from './pages/MemberDetail';
import { Members } from './pages/Members';
import { Reports } from './pages/Reports';
import { Scan } from './pages/Scan';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/*" element={<AuthenticatedApp />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const [signedIn, setSignedIn] = useState(() => Boolean(readToken()));
  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;
  return <Workspace />;
}

const COUNT_REFRESH_MS = 120_000;

function Workspace() {
  const { data: me, error, loading, reload } = useAsync<Me>(() => api.me(), []);
  const [overdueCount, setOverdueCount] = useState(0);

  const refreshCounts = useCallback(() => {
    api
      .summary()
      .then((summary) => setOverdueCount(summary.loans.overdue))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!me) return;
    refreshCounts();
    const timer = setInterval(refreshCounts, COUNT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [me, refreshCounts]);

  if (loading) return <BootScreen />;

  if (error || !me) return <StartupError error={error} onRetry={reload} />;

  return (
    <SessionProvider
      value={{
        me,
        org: me.org,
        timezone: me.org.timezone,
        isAdmin: me.user.roles.includes('admin'),
        refresh: reload,
        overdueCount,
        refreshCounts,
      }}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="scan" element={<Scan />} />
          <Route path="loans" element={<Loans />} />
          <Route path="assets" element={<Assets />} />
          <Route path="assets/labels" element={<Labels />} />
          <Route path="assets/:assetId" element={<AssetDetail />} />
          <Route path="a/:assetId" element={<AssetDetail />} />
          <Route path="members" element={<Members />} />
          <Route path="members/:memberId" element={<MemberDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}

function BootScreen() {
  return (
    <div className="login-screen">
      <div className="col center" style={{ alignItems: 'center', gap: 12 }}>
        <span className="brand-mark" style={{ width: 44, height: 44, borderRadius: 13 }}>
          <Icon name="loans" size={20} />
        </span>
        <span className="muted small">Loading your branch…</span>
      </div>
    </div>
  );
}

function StartupError({ error, onRetry }: { error: Error | undefined; onRetry: () => void }) {
  return (
    <div className="login-screen">
      <Card className="login-card">
        <span className="brand-mark">
          <Icon name="alert" size={20} />
        </span>
        <h1 style={{ marginBottom: 8 }}>Cannot load data</h1>
        <p className="muted small" style={{ marginBottom: 18 }}>
          {error?.message ?? 'The service did not respond.'}
        </p>
        <div className="btn-group" style={{ justifyContent: 'center' }}>
          <Button variant="primary" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
          <Button onClick={logout}>Sign out</Button>
        </div>
      </Card>
    </div>
  );
}

import { createContext, useContext, type ReactNode } from 'react';
import type { Me, Org } from './lib/types';

interface SessionValue {
  me: Me;
  /** Convenience: every date on screen is rendered in the branch's timezone. */
  timezone: string;
  org: Org;
  isAdmin: boolean;
  refresh: () => void;
  overdueCount: number;
  refreshCounts: () => void;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}

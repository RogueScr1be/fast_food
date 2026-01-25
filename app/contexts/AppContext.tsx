import React, { createContext, useContext, useMemo, useState } from 'react';

type AppContextValue = {
  // Keep minimal; expand later.
  ready: boolean;
  setReady: (v: boolean) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  const value = useMemo(() => ({ ready, setReady }), [ready]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

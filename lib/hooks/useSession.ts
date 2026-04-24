import { useContext } from 'react';
import { SessionContext, type SessionContextType } from '../context/SessionContext';

export function useSession(): SessionContextType {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error(
      'useSession must be used within a SessionProvider. ' +
      'Make sure SessionProvider is mounted in app/_layout.tsx'
    );
  }

  return context;
}

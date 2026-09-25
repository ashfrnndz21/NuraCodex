import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createPreviewIdentityAdapter } from '../services/previewIdentity.mjs';
import type { PreviewIdentityChallenge, PreviewIdentityChannel, PreviewIdentitySession } from '../services/previewIdentity.mjs';

const STORAGE_KEY = 'nura.synthetic-preview-session.v1';
type PreviewIdentityState = {
  ready: boolean;
  session: PreviewIdentitySession | null;
  requestCode: (channel: PreviewIdentityChannel, destination: string) => PreviewIdentityChallenge;
  verifyCode: (challengeId: string, code: string) => Promise<PreviewIdentitySession>;
  signOut: () => Promise<void>;
};
const PreviewIdentityContext = createContext<PreviewIdentityState | null>(null);

async function readStoredSession(adapter: ReturnType<typeof createPreviewIdentityAdapter>) {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY))
      : await SecureStore.getItemAsync(STORAGE_KEY);
    return raw ? adapter.restoreSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function writeStoredSession(session: PreviewIdentitySession | null) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    return;
  }
  if (session) await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(STORAGE_KEY);
}

export function PreviewIdentityProvider({ children }: { children: React.ReactNode }) {
  const adapter = useMemo(() => createPreviewIdentityAdapter(), []);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<PreviewIdentitySession | null>(null);

  useEffect(() => {
    let active = true;
    readStoredSession(adapter).then((restored) => {
      if (!active) return;
      setSession(restored);
      setReady(true);
    });
    return () => { active = false; };
  }, [adapter]);

  const requestCode = useCallback((channel: PreviewIdentityChannel, destination: string) => adapter.requestCode(channel, destination), [adapter]);
  const verifyCode = useCallback(async (challengeId: string, code: string) => {
    const next = adapter.verifyCode(challengeId, code);
    await writeStoredSession(next);
    setSession(next);
    return next;
  }, [adapter]);
  const signOut = useCallback(async () => {
    await writeStoredSession(null);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ ready, session, requestCode, verifyCode, signOut }), [ready, session, requestCode, verifyCode, signOut]);
  return <PreviewIdentityContext.Provider value={value}>{children}</PreviewIdentityContext.Provider>;
}

export function usePreviewIdentity() {
  const value = useContext(PreviewIdentityContext);
  if (!value) throw new Error('usePreviewIdentity must be used inside PreviewIdentityProvider');
  return value;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { createPreviewIdentityAdapter } from '../services/previewIdentity.mjs';
import type { PreviewIdentityChallenge, PreviewIdentityChannel } from '../services/previewIdentity.mjs';
import { createDemoServerSession, revokeDemoServerSession, validateDemoServerSession } from '../services/demoSessionClient';
import { registerDemoSessionInvalidationHandler, setDemoSessionToken } from '../services/demoSessionToken';

const STORAGE_KEY = 'nura.synthetic-preview-session.v1';
type PreviewIdentitySession = {
  mode: 'synthetic_preview';
  accessToken: string;
  expiresAt: string;
};
type PreviewIdentityState = {
  ready: boolean;
  session: PreviewIdentitySession | null;
  sessionWarning: string;
  requestCode: (channel: PreviewIdentityChannel, destination: string) => PreviewIdentityChallenge;
  verifyCode: (challengeId: string, code: string) => Promise<PreviewIdentitySession>;
  signOut: () => Promise<void>;
};
const PreviewIdentityContext = createContext<PreviewIdentityState | null>(null);

function parseStoredSession(value: unknown): PreviewIdentitySession | null {
  if (!value || typeof value !== 'object') return null;
  const stored = value as Partial<PreviewIdentitySession>;
  if (stored.mode !== 'synthetic_preview' || typeof stored.accessToken !== 'string' || !/^[A-Za-z0-9_-]{40,256}$/.test(stored.accessToken) || typeof stored.expiresAt !== 'string') return null;
  if (!Number.isFinite(Date.parse(stored.expiresAt)) || Date.now() >= Date.parse(stored.expiresAt)) return null;
  return { mode: 'synthetic_preview', accessToken: stored.accessToken, expiresAt: stored.expiresAt };
}

async function readStoredSession(onWarning: (message: string) => void = () => {}) {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY))
      : await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    let stored: unknown;
    try { stored = JSON.parse(raw); } catch { stored = null; }
    const session = parseStoredSession(stored);
    if (!session) {
      await writeStoredSession(null);
      setDemoSessionToken(null);
      return null;
    }
    setDemoSessionToken(session.accessToken, session.expiresAt);
    try {
      if (!await validateDemoServerSession(session.accessToken)) {
        await writeStoredSession(null);
        setDemoSessionToken(null);
        return null;
      }
    } catch {
      setDemoSessionToken(null);
      try { await writeStoredSession(null); } catch { /* keep the protected app closed if local storage is unavailable */ }
      onWarning('Nura could not verify this local preview session. Check that the preview service is running, then sign in again.');
      return null;
    }
    return session;
  } catch {
    setDemoSessionToken(null);
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
  const challenges = useRef(new Map<string, PreviewIdentityChallenge>());
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<PreviewIdentitySession | null>(null);
  const [sessionWarning, setSessionWarning] = useState('');

  useEffect(() => {
    let active = true;
    const unregisterInvalidationHandler = registerDemoSessionInvalidationHandler(() => {
      void writeStoredSession(null);
      setSession(null);
      router.replace('/sign-in');
    });
    readStoredSession((warning) => { if (active) setSessionWarning(warning); }).then((restored) => {
      if (!active) return;
      setSession(restored);
      setReady(true);
    });
    return () => { active = false; unregisterInvalidationHandler(); };
  }, []);

  const requestCode = useCallback((channel: PreviewIdentityChannel, destination: string) => {
    const challenge = adapter.requestCode(channel, destination);
    challenges.current.set(challenge.challengeId, challenge);
    return challenge;
  }, [adapter]);
  const verifyCode = useCallback(async (challengeId: string, code: string) => {
    const challenge = challenges.current.get(challengeId);
    if (!challenge) throw new Error('Request a new preview code to continue.');
    if (Date.now() >= challenge.expiresAt) {
      challenges.current.delete(challengeId);
      throw new Error('This preview code has expired. Request a new one.');
    }
    if (String(code).trim() !== challenge.code) throw new Error('That preview code is not correct.');
    const issued = await createDemoServerSession(challenge.channel, challenge.destination, code);
    const next: PreviewIdentitySession = { mode: 'synthetic_preview', accessToken: issued.accessToken, expiresAt: issued.expiresAt };
    try {
      await writeStoredSession(next);
    } catch (error) {
      void revokeDemoServerSession(issued.accessToken).catch(() => {});
      throw error;
    }
    challenges.current.delete(challengeId);
    setDemoSessionToken(next.accessToken, next.expiresAt);
    setSessionWarning('');
    setSession(next);
    return next;
  }, []);
  const signOut = useCallback(async () => {
    const token = session?.accessToken;
    setDemoSessionToken(null);
    setSession(null);
    setSessionWarning('');
    let storageCouldNotClear = false;
    try { await writeStoredSession(null); }
    catch { storageCouldNotClear = true; }
    let serverCouldNotRevoke = false;
    if (token) {
      try { await revokeDemoServerSession(token); }
      catch { serverCouldNotRevoke = true; }
    }
    if (storageCouldNotClear || serverCouldNotRevoke) {
      setSessionWarning(serverCouldNotRevoke
        ? 'You are signed out on this device. Nura could not confirm ending the local preview session; it expires automatically within 30 minutes.'
        : 'You are signed out on this device, but a saved preview sign-in could not be removed. Reopen this page to verify sign-in again.');
    }
  }, [session]);

  const value = useMemo(() => ({ ready, session, sessionWarning, requestCode, verifyCode, signOut }), [ready, session, sessionWarning, requestCode, verifyCode, signOut]);
  return <PreviewIdentityContext.Provider value={value}>{children}</PreviewIdentityContext.Provider>;
}

export function usePreviewIdentity() {
  const value = useContext(PreviewIdentityContext);
  if (!value) throw new Error('usePreviewIdentity must be used inside PreviewIdentityProvider');
  return value;
}

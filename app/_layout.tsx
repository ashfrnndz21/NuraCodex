import React, { useEffect, useRef, useState } from 'react';
import { DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, StyleSheet, UIManager, View } from 'react-native';
import { NuraProvider, useNura } from '../src/state/NuraContext';
import { AIStateProvider } from '../src/state/AIStateContext';
import { PreviewIdentityProvider, usePreviewIdentity } from '../src/state/PreviewIdentityContext';
import { colors, motion } from '../src/theme';
import { shouldRedirectToProfileSetup } from '../src/services/profileRouteGate.mjs';
import { animatedNativeDriver } from '../src/services/animatedDriver';
import type { ReactNode } from 'react';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

const NuraNavigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.cobalt },
};
export default function RootLayout() {
  const pathname = usePathname();
  const [opacity] = useState(() => new Animated.Value(1));
  const [offset] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(false);
  const previousPath = useRef(pathname);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const routeChanged = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (reducedMotion) { opacity.setValue(1); offset.setValue(0); return; }
    if (!routeChanged) return;
    const isWeb = Platform.OS === 'web';
    opacity.setValue(isWeb ? 0.88 : 0.96);
    offset.setValue(isWeb ? 14 : 0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: isWeb ? motion.standard : motion.quick, useNativeDriver: animatedNativeDriver }),
      Animated.timing(offset, { toValue: 0, duration: motion.standard, useNativeDriver: animatedNativeDriver }),
    ]).start();
  }, [offset, opacity, pathname, reducedMotion]);
  const stageStyle = Platform.OS === 'web' ? styles.webStage : styles.nativeStage;
  const frameStyle = Platform.OS === 'web' ? styles.webPhone : styles.nativePhone;
  return <View style={stageStyle}><View style={frameStyle}><PreviewIdentityProvider><ThemeProvider value={NuraNavigationTheme}><StatusBar style="dark" /><Animated.View style={[styles.navigator, { opacity, transform: Platform.OS === 'web' ? [{ translateX: offset }] : [{ translateY: offset }] }]}><SessionNavigator reducedMotion={reducedMotion} /></Animated.View></ThemeProvider></PreviewIdentityProvider></View></View>;
}

function SessionNavigator({ reducedMotion }: { reducedMotion: boolean }) {
  const { ready, session } = usePreviewIdentity();
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.violet} /></View>;
  const appRoutes = <Stack.Protected guard={Boolean(session)}>
    <Stack.Screen name="index" />
    <Stack.Screen name="profile-summary" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="intake" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="review" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="insurance" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="treatment" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="visits" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="symptoms" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="privacy" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="registry" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} />
    <Stack.Screen name="ask" options={{ presentation: 'modal', animation: reducedMotion ? 'none' : 'slide_from_bottom' }} />
    <Stack.Screen name="(tabs)" />
  </Stack.Protected>;
  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reducedMotion ? 'none' : 'fade' }}>
    <Stack.Protected guard={!session}><Stack.Screen name="sign-in" /></Stack.Protected>
    {appRoutes}
  </Stack>;
  return session ? <NuraProvider><AIStateProvider><ProfileSetupGate>{stack}</ProfileSetupGate></AIStateProvider></NuraProvider> : stack;
}

function ProfileSetupGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, name, country, birthday, topics, facts, assets, treatments, visits } = useNura();
  const redirectToSetup = ready && shouldRedirectToProfileSetup(pathname, { name, country, birthday, topics, facts, assets, treatments, visits });

  useEffect(() => {
    if (redirectToSetup) router.replace('/');
  }, [redirectToSetup]);

  if (!ready || redirectToSetup) return <View style={styles.loading}><ActivityIndicator color={colors.violet} /></View>;
  return <>{children}</>;
}
const styles = StyleSheet.create({
  nativeStage: { flex: 1, backgroundColor: colors.bg },
  nativePhone: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  webStage: { flex: 1, backgroundColor: '#ECEAF0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  webPhone: { flex: 1, width: '100%', maxWidth: 390, maxHeight: 844, borderRadius: 34, overflow: 'hidden', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, shadowColor: '#49345D', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
  navigator: { flex: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});

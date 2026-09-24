import React, { useEffect, useState } from 'react';
import { DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { NuraProvider } from '../src/state/NuraContext';
import { AIStateProvider } from '../src/state/AIStateContext';

const NuraNavigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#F7F6F8', card: '#FBFAFC', text: '#292731', border: '#E4E1E8', primary: '#1767D8' },
};
export default function RootLayout() {
  const pathname = usePathname();
  const [opacity] = useState(() => new Animated.Value(1));
  const [offset] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); offset.setValue(0); return; }
    opacity.setValue(0.92);
    offset.setValue(5);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(offset, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [offset, opacity, pathname, reducedMotion]);
  const stageStyle = Platform.OS === 'web' ? styles.webStage : styles.nativeStage;
  const frameStyle = Platform.OS === 'web' ? styles.webPhone : styles.nativePhone;
  return <View style={stageStyle}><View style={frameStyle}><NuraProvider><AIStateProvider><ThemeProvider value={NuraNavigationTheme}><StatusBar style="dark" /><Animated.View style={[styles.navigator, { opacity, transform: [{ translateY: offset }] }]}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7F6F8' }, animation: reducedMotion ? 'none' : 'fade' }}><Stack.Screen name="index" /><Stack.Screen name="profile-summary" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="intake" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="review" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="insurance" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="treatment" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="visits" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="symptoms" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="privacy" options={{ presentation: 'card', animation: reducedMotion ? 'none' : 'slide_from_right' }} /><Stack.Screen name="ask" options={{ presentation: 'modal', animation: reducedMotion ? 'none' : 'slide_from_bottom' }} /><Stack.Screen name="(tabs)" /></Stack></Animated.View></ThemeProvider></AIStateProvider></NuraProvider></View></View>;
}
const styles = StyleSheet.create({
  nativeStage: { flex: 1, backgroundColor: '#F7F6F8' },
  nativePhone: { flex: 1, backgroundColor: '#F7F6F8', overflow: 'hidden' },
  webStage: { flex: 1, backgroundColor: '#ECEAF0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  webPhone: { flex: 1, width: '100%', maxWidth: 390, maxHeight: 844, borderRadius: 34, overflow: 'hidden', backgroundColor: '#F7F6F8', borderWidth: 1, borderColor: '#DDD9E2', shadowColor: '#353142', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
  navigator: { flex: 1 },
});

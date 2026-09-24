import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, motion, radius, shadow } from '../theme';
export function Surface({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string }) {
  const [scale] = useState(() => new Animated.Value(1));
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const animate = (toValue: number) => { if (reducedMotion) return; Animated.timing(scale, { toValue, duration: toValue === 1 ? motion.pressOut : motion.pressIn, easing: toValue === 1 ? Easing.bezier(...motion.easing.bouncy) : Easing.linear, useNativeDriver: true }).start(); };
  if (onPress) return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} onPressIn={() => animate(motion.pressScale)} onPressOut={() => animate(1)} style={[styles.surface, style]}>{children}</Pressable></Animated.View>;
  return <View style={[styles.surface, style]}>{children}</View>;
}
export function Pill({ children, selected = false, onPress }: { children: React.ReactNode; selected?: boolean; onPress?: () => void }) {
  const [scale] = useState(() => new Animated.Value(1));
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const animate = (toValue: number) => { if (reducedMotion) return; Animated.timing(scale, { toValue, duration: toValue === 1 ? motion.pressOut : motion.pressIn, easing: toValue === 1 ? Easing.bezier(...motion.easing.bouncy) : Easing.linear, useNativeDriver: true }).start(); };
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} onPressIn={() => animate(motion.pressScale)} onPressOut={() => animate(1)} style={[styles.pill, selected && styles.pillSelected]}><Text style={[styles.pillText, selected && styles.pillTextSelected]}>{children}</Text></Pressable></Animated.View>;
}
export function Label({ children, style }: { children: React.ReactNode; style?: any }) { return <Text style={[styles.label, style]}>{children}</Text>; }
const styles = StyleSheet.create({ surface: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 18, ...shadow }, pill: { borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginRight: 8, marginBottom: 9 }, pillSelected: { backgroundColor: colors.cobalt, borderColor: colors.cobalt }, pillText: { color: colors.muted, fontSize: 14, fontWeight: '500' }, pillTextSelected: { color: '#FFFFFF' }, label: { color: colors.quiet, letterSpacing: 1.5, textTransform: 'uppercase', fontSize: 10, fontWeight: '700' } });
